# MediTrace

**Medication continuity, safe handover and reconciliation · Problem Statement 4**
Team **NOVACODE** · SRM Ramapuram

MediTrace closes the handover gap between hospital discharge and the first outpatient visit. It reconciles both medication lists, traces each value to its source line, flags discrepancies with deterministic rules, and requires two verified clinicians to sign each decision before the patient sees plain-language instructions.

> All data is **synthetic**. This is a demo prototype: data, sign-in and MFA run in the browser (localStorage). It is not secure medical record storage and is not HIPAA/GDPR certified.

## Run it

It's a static React app with no build step: React 18 UMD, in-browser JSX, Tailwind via CDN.

```bash
npm start        # serves the folder at http://localhost:3000
```

Or open `index.html` through any static file server. Opening it directly with `file://` won't work, because the browser must fetch the `js/` files.

## Demo accounts

On the sign-in screen, choose **Doctor** or **Patient** and pick a demo account. Clinicians must enter the 6-digit code shown by the on-screen demo authenticator.

| Account | Shows |
|---|---|
| Dr. Léa Moreau | Verified physician: full workflow, analytics |
| R. Osei, PharmD | Verified pharmacist: second signature |
| Dr. Sam Reyes | Licence suspended: masked data, blocked actions |
| Mara Lindqvist | Patient: verified medicines, daily checklist |

## Features

- Source-traced extraction and a cross-visit reconciliation matrix with automated discrepancy flags
- Two-person review (decide → verify by a different clinician)
- Analytics dashboard: discrepancy breakdown, surge capacity meter, handover trend, pulsing status badges
- **Constraint 5:** surge demand (×3) vs reduced clinician capacity (50%), with priority allocation and an ordered wait-list
- **Constraint 12:** missing critical facts block approval; no guessing; escalation to a verified clinician
- Mandatory MFA for clinicians, licence (NPI) verification, an Access Control Enforcer, an idle auto-lock and a hash-chained audit log
- Patient-safe view, consent management, daily checklist, light and dark mode

## Project layout

```
index.html        app shell, styles, CDN libraries
js/               React components (core, ui, recon, auth, patient, history, doctor, constraints, security, analytics, app)
assets/           logo and icons
vercel.json       static hosting config (no build)
```

## Deploy (free)

Import this repository on [Vercel](https://vercel.com/new) (Hobby plan). The framework preset is **Other**, with no build command and output directory `.`. No environment variables are needed.

## Team NOVACODE · SRM Ramapuram

Sai Sidharth R · K Sakthidharan · Vishal Rajesh · Sai Sharan Ravichandran
