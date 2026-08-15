// ============================================================================
// morning/MeasurementMethodSelector.jsx
// ----------------------------------------------------------------------------
// Écran de choix Bluetooth / Caméra. Détection auto de disponibilité ;
// si Bluetooth indisponible, la caméra est mise en avant (§1 cahier des
// charges) sans forcer la navigation — l'athlète garde la main.
// ============================================================================
import React from "react";
import { Bluetooth, Camera, ChevronRight } from "lucide-react";
import { SURFACE, BORDER, INK, MUTED, MUTED2, ACCENT, BLUE } from "../theme.js";
import { isBluetoothSupported } from "./bleHeartRate.js";
import { isCameraPpgSupported } from "./cameraPpgCapture.js";

export default function MeasurementMethodSelector({ onSelect, onSkip, t }) {
  const bluetoothOk = isBluetoothSupported();
  const cameraOk = isCameraPpgSupported();

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: 700, fontSize: 15, color: INK }}>
        {t("method_select_title")}
      </div>

      <button onClick={() => onSelect("bluetooth")} disabled={!bluetoothOk} style={{
        display: "flex", alignItems: "center", gap: 12, textAlign: "left", cursor: bluetoothOk ? "pointer" : "not-allowed",
        opacity: bluetoothOk ? 1 : 0.45,
        background: `linear-gradient(135deg, ${BLUE}14, ${SURFACE})`, border: `1px solid ${BLUE}44`, borderRadius: 14, padding: "14px 16px",
      }}>
        <Bluetooth size={20} color={BLUE} />
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 700, fontSize: 14, color: INK }}>{t("method_bluetooth")}</div>
          {!bluetoothOk && <div style={{ fontSize: 11, color: MUTED2, marginTop: 2 }}>{t("morning_ble_unsupported")}</div>}
        </div>
        <ChevronRight size={16} color={MUTED2} />
      </button>

      <button onClick={() => onSelect("camera")} disabled={!cameraOk} style={{
        display: "flex", alignItems: "center", gap: 12, textAlign: "left", cursor: cameraOk ? "pointer" : "not-allowed",
        opacity: cameraOk ? 1 : 0.45,
        background: `linear-gradient(135deg, ${ACCENT}14, ${SURFACE})`, border: `1px solid ${ACCENT}44`, borderRadius: 14, padding: "14px 16px",
      }}>
        <Camera size={20} color={ACCENT} />
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 700, fontSize: 14, color: INK }}>{t("method_camera")}</div>
          {!bluetoothOk && cameraOk && <div style={{ fontSize: 11, color: ACCENT, marginTop: 2 }}>{t("method_camera_auto_suggested")}</div>}
        </div>
        <ChevronRight size={16} color={MUTED2} />
      </button>

      {onSkip && (
        <button onClick={onSkip} style={{ background: "transparent", border: `1px solid ${BORDER}`, color: MUTED, borderRadius: 9, padding: "10px 14px", fontSize: 12.5, cursor: "pointer" }}>
          {t("morning_skip_test")}
        </button>
      )}
    </div>
  );
}
