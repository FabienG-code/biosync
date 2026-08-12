// ============================================================================
// morning/bleHeartRate.js — BioSync
// ----------------------------------------------------------------------------
// Phase 2 : capture Bluetooth Low Energy pour ceintures cardiaques
// compatibles Heart Rate Service (0x180D) — Polar H10, Garmin HRM-Pro,
// Wahoo Tickr, Coospo, etc. Même séparation stricte que poseCapture.js /
// jumpDetector.js côté module CMJ :
//
//   PARTIE PURE (testable sans navigateur, `node morning/bleHeartRate.test.js`) :
//     parseHeartRateMeasurement()   — décodage du protocole Bluetooth SIG
//     assessConnectionContinuity()  — détection des trous de signal
//
//   PARTIE NAVIGATEUR (Web Bluetooth API, vérifiable uniquement sur appareil) :
//     requestHeartRateDevice(), connectHeartRateSensor(),
//     startHeartRateNotifications(), attachAutoReconnect(), readBatteryLevel()
//
// PIPELINE :
//   bleHeartRate.js  -> flux { heartRate, rrIntervalsMs, sensorContact, timestampMs }
//   hrvEngine.js     -> cleanRRIntervals() -> RMSSD/SDNN -> rapport orthostatique
//   OrthostaticTestScreen.jsx -> orchestration UI (phase 3)
//
// ⚠️ Web Bluetooth n'est disponible que sur des contextes sécurisés (HTTPS)
// et n'est pas supporté par Safari iOS à ce jour — voir isBluetoothSupported()
// et le repli attendu côté UI (phase 3) si l'appareil n'est pas compatible.
// ============================================================================

// ============================================================================
// 1. Décodage du protocole Heart Rate Measurement (0x2A37)
// ----------------------------------------------------------------------------
// Spécification Bluetooth SIG — octet Flags :
//   bit0   : format de la FC (0 = UINT8, 1 = UINT16)
//   bit1   : statut du contact capteur (1 = détecté) — significatif seulement si bit2=1
//   bit2   : contact capteur supporté par l'appareil (0 = information non disponible)
//   bit3   : énergie dépensée présente (UINT16, kJ)
//   bit4   : intervalle(s) RR présents (un ou plusieurs UINT16, unité 1/1024s)
//
// Les intervalles RR sont l'entrée principale du moteur HRV (hrvEngine.js) —
// c'est la donnée la plus importante de ce parsing.
// ============================================================================
export function parseHeartRateMeasurement(bytes) {
  const data = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes || []);
  if (data.length < 2) return null; // trame trop courte pour être exploitable

  let offset = 0;
  const flags = data[offset];
  offset += 1;

  const hrFormatUint16 = (flags & 0x01) !== 0;
  const sensorContactSupported = (flags & 0x04) !== 0;
  const sensorContactDetected = (flags & 0x02) !== 0;
  const energyExpendedPresent = (flags & 0x08) !== 0;
  const rrIntervalPresent = (flags & 0x10) !== 0;

  let heartRate = null;
  if (hrFormatUint16) {
    if (offset + 1 >= data.length) return null;
    heartRate = data[offset] | (data[offset + 1] << 8);
    offset += 2;
  } else {
    if (offset >= data.length) return null;
    heartRate = data[offset];
    offset += 1;
  }

  let energyExpended = null;
  if (energyExpendedPresent) {
    if (offset + 1 < data.length) {
      energyExpended = data[offset] | (data[offset + 1] << 8);
      offset += 2;
    }
  }

  const rrIntervalsMs = [];
  if (rrIntervalPresent) {
    while (offset + 1 < data.length) {
      const raw = data[offset] | (data[offset + 1] << 8);
      offset += 2;
      // Unité native Bluetooth : 1/1024 seconde -> millisecondes
      rrIntervalsMs.push(Math.round((raw / 1024) * 1000));
    }
  }

  return {
    heartRate,
    sensorContact: sensorContactSupported ? sensorContactDetected : null,
    energyExpended,
    rrIntervalsMs,
  };
}

// ============================================================================
// 2. Continuité du signal (détection de décrochage)
// ----------------------------------------------------------------------------
// Même logique que assessContinuity dans qualityControl.js (module CMJ) :
// détecte les trous entre notifications successives plutôt que de compter
// des notifications manquantes (impossible à observer directement).
// ============================================================================
export const HR_SIGNAL_GAP_THRESHOLD_MS = 5000; // pas de notification depuis 5s = signal perdu

export function assessConnectionContinuity(beatTimestampsMs, options = {}) {
  const gapThresholdMs = options.gapThresholdMs ?? HR_SIGNAL_GAP_THRESHOLD_MS;
  const ts = [...(beatTimestampsMs || [])].sort((a, b) => a - b);
  if (ts.length < 2) return { ok: false, gaps: [], totalGapMs: 0 };

  const gaps = [];
  let totalGapMs = 0;
  for (let i = 1; i < ts.length; i++) {
    const delta = ts[i] - ts[i - 1];
    if (delta > gapThresholdMs) {
      gaps.push({ afterIndex: i - 1, startMs: ts[i - 1], durationMs: delta });
      totalGapMs += delta;
    }
  }
  return { ok: gaps.length === 0, gaps, totalGapMs };
}

// ============================================================================
// 3. Découverte et connexion (Web Bluetooth — navigateur uniquement)
// ----------------------------------------------------------------------------
// L'appel à requestHeartRateDevice() DOIT être déclenché par un geste
// utilisateur explicite (même contrainte que getUserMedia côté caméra,
// cf. poseCapture.js) — impossible de scanner en arrière-plan.
// ============================================================================
export const HEART_RATE_SERVICE_UUID = "heart_rate"; // 0x180D
export const HEART_RATE_MEASUREMENT_UUID = "heart_rate_measurement"; // 0x2A37
export const BATTERY_SERVICE_UUID = "battery_service"; // 0x180F
export const BATTERY_LEVEL_UUID = "battery_level"; // 0x2A19

export function isBluetoothSupported() {
  return typeof navigator !== "undefined" && !!navigator.bluetooth;
}

export async function requestHeartRateDevice() {
  return navigator.bluetooth.requestDevice({
    filters: [{ services: [HEART_RATE_SERVICE_UUID] }],
    optionalServices: [BATTERY_SERVICE_UUID],
  });
}

// Connecte au serveur GATT et récupère les caractéristiques utiles. La
// caractéristique batterie est optionnelle : certaines ceintures (ex.
// certains modèles Polar) n'exposent pas le service Battery — on continue
// sans bloquer le test dans ce cas (non bloquant, cf. §1 du cahier des
// charges : "contrôle du niveau de batterie lorsque disponible").
export async function connectHeartRateSensor(device) {
  const server = await device.gatt.connect();
  const hrService = await server.getPrimaryService(HEART_RATE_SERVICE_UUID);
  const hrCharacteristic = await hrService.getCharacteristic(HEART_RATE_MEASUREMENT_UUID);

  let batteryCharacteristic = null;
  try {
    const batteryService = await server.getPrimaryService(BATTERY_SERVICE_UUID);
    batteryCharacteristic = await batteryService.getCharacteristic(BATTERY_LEVEL_UUID);
  } catch (err) {
    batteryCharacteristic = null;
  }

  return { server, hrCharacteristic, batteryCharacteristic };
}

export async function readBatteryLevel(batteryCharacteristic) {
  if (!batteryCharacteristic) return null;
  try {
    const value = await batteryCharacteristic.readValue();
    return value.getUint8(0);
  } catch (err) {
    return null;
  }
}

// ============================================================================
// 4. Notifications temps réel
// ----------------------------------------------------------------------------
// Chaque notification est immédiatement parsée (parseHeartRateMeasurement,
// partie pure) puis transmise avec un horodatage local — l'horodatage sert
// à assessConnectionContinuity() pour détecter les décrochages, PAS à situer
// les battements dans le temps (ça, c'est le rôle des RR eux-mêmes, cf.
// hrvEngine.js §4).
// ============================================================================
export function startHeartRateNotifications(hrCharacteristic, onMeasurement) {
  function handleChange(event) {
    const value = event.target.value; // DataView
    const bytes = new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
    const parsed = parseHeartRateMeasurement(bytes);
    if (parsed) onMeasurement({ ...parsed, timestampMs: performance.now() });
  }

  hrCharacteristic.addEventListener("characteristicvaluechanged", handleChange);
  hrCharacteristic.startNotifications();

  return function stop() {
    hrCharacteristic.removeEventListener("characteristicvaluechanged", handleChange);
    hrCharacteristic.stopNotifications().catch(() => {});
  };
}

// ============================================================================
// 5. Reconnexion automatique
// ----------------------------------------------------------------------------
// Web Bluetooth ne permet pas de re-scanner en arrière-plan sans geste
// utilisateur, MAIS un appareil déjà apparié (objet `device` conservé en
// mémoire) peut être reconnecté via `device.gatt.connect()` sans nouveau
// scan — c'est ce qu'on exploite ici à chaque événement de déconnexion,
// avec un backoff exponentiel pour ne pas harceler le capteur.
// ============================================================================
export const RECONNECT_BASE_DELAY_MS = 1000;
export const RECONNECT_MAX_DELAY_MS = 10000;
export const RECONNECT_MAX_ATTEMPTS = 5;

export function attachAutoReconnect(device, onReconnected, onReconnectFailed, options = {}) {
  const maxAttempts = options.maxAttempts ?? RECONNECT_MAX_ATTEMPTS;
  const baseDelayMs = options.baseDelayMs ?? RECONNECT_BASE_DELAY_MS;
  const maxDelayMs = options.maxDelayMs ?? RECONNECT_MAX_DELAY_MS;
  let cancelled = false;

  async function handleDisconnect() {
    if (cancelled) return;
    let attempt = 0;
    while (attempt < maxAttempts && !cancelled) {
      const delay = Math.min(baseDelayMs * 2 ** attempt, maxDelayMs);
      await new Promise((resolve) => setTimeout(resolve, delay));
      if (cancelled) return;
      try {
        const connection = await connectHeartRateSensor(device);
        if (!cancelled) onReconnected(connection);
        return;
      } catch (err) {
        attempt++;
      }
    }
    if (!cancelled) onReconnectFailed();
  }

  device.addEventListener("gattserverdisconnected", handleDisconnect);
  return function detach() {
    cancelled = true;
    device.removeEventListener("gattserverdisconnected", handleDisconnect);
  };
}

export function disconnectHeartRateSensor(device) {
  if (device?.gatt?.connected) device.gatt.disconnect();
}
