# BioSync

App de suivi d'entraînement, récupération et nutrition — connectée à Google Sheets.

## Démarrer en local (optionnel, pour tester avant de déployer)

```bash
npm install
npm run dev
```
Ouvre l'URL affichée (généralement http://localhost:5173).

## Déployer sur Vercel (gratuit)

1. Pousse ce dossier sur un dépôt GitHub :
   ```bash
   git init
   git add .
   git commit -m "BioSync"
   git branch -M main
   git remote add origin https://github.com/<ton-compte>/biosync.git
   git push -u origin main
   ```
2. Va sur [vercel.com](https://vercel.com), connecte-toi avec GitHub.
3. "Add New..." → "Project" → sélectionne le dépôt `biosync`.
4. Vercel détecte Vite automatiquement (Build Command: `vite build`, Output: `dist`) — laisse les réglages par défaut.
5. "Deploy". Après ~1 minute, Vercel donne une URL publique (ex. `biosync-xxxx.vercel.app`).

C'est cette URL que tu partages avec tes athlètes.

## Identifiants

- Coach : `FabienG` / `Fg421986$`
- Les athlètes de démo (Léa, Karim, Sofia) sont toujours présents avec leurs mots de passe d'origine (`lea123`, etc.) — supprime-les depuis l'onglet Athlètes une fois tes vrais athlètes ajoutés.

## Google Sheets

Le lien vers le backend Google Apps Script est déjà configuré dans `src/App.jsx` (`SHEETS_API_URL`). Chaque athlète obtient automatiquement son propre Google Sheet dans un dossier Drive "BioSync" dès que le coach l'ajoute dans l'app.

Si tu dois changer l'URL du backend (nouveau déploiement Apps Script), modifie la constante `SHEETS_API_URL` en haut de `src/App.jsx`, commit, push — Vercel redéploie automatiquement.

## Mettre à jour l'app après déploiement

Toute modification de `src/App.jsx` + `git push` déclenche un redéploiement automatique sur Vercel (aucune action manuelle nécessaire une fois le repo connecté).
