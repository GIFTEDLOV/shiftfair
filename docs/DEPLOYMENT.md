# Deployment and verification

## Contract

- Network: GenLayer Studionet, chain ID `61999`
- RPC: `https://studio.genlayer.com/api`
- Contract: [0xdB7419b175bb5Ff63343f8a9Ac7f42f11feA03Fd](https://explorer-studio.genlayer.com/address/0xdB7419b175bb5Ff63343f8a9Ac7f42f11feA03Fd)
- Deployed-source SHA-256: `958bc9996945b9064abd98b7a712b799dc7d9905de89b2ca7305b8e0cefaf2d5`
- ABI schema SHA-256: `29fa8f2f2b889f08f5452de2dd06e76a349111d28801364a3bf32d85c1220e20`
- Source parity: exact `getContractCode` byte match with `contracts/shiftfair.py`, verified using GenLayerJS 1.1.8.
- The existing verified V4 deployment is preserved. No replacement deployment was made.

## Live evidence

- Historic qualification case `GLV4-shiftfair-39138804500` finalized `REVIEW_REQUIRED`; details and transaction hashes are in the checked-in evidence.
- Qualification Actions: [run 39138804500](https://github.com/GIFTEDLOV/driftproof/actions/runs/39138804500).
- Latest exact-main qualification CI on the release preparation baseline: [run 39175261903](https://github.com/GIFTEDLOV/shiftfair/actions/runs/39175261903).

## Production application

- Alias: https://shiftfair-genlayer.vercel.app
- Current Vercel production deployment: `dpl_Dn2XLYLqNLMZpRJHSzhYMpeVQzZy`
- Deployment URL: https://shiftfair-genlayer-i6kg3jkun-kolofahkelvin16-6437s-projects.vercel.app
- Runtime config binds chain `61999`, contract `0xdB7419b175bb5Ff63343f8a9Ac7f42f11feA03Fd`, and the SHA-256 above. Wallet writes are enabled only after real signed-browser qualification.
- The browser test suite covers desktop and 390 px Chromium, account/network changes, rejection, duplicate-write prevention, exact transaction recovery, successful GenVM execution, and canonical state readback.
- The 2026-10-18 22:58 UTC RPC rate-limit response is preserved in evidence/signed-browser-registry-rate-limit.json. The production registry browser check passed on 2026-10-19 after the quota reset; see evidence/signed-browser-registry.json and evidence/production-registry-retries.json.


## Verifier

`npm run verify:live` is read-only: it retrieves deployed bytes, checks the expected hash and ABI schema, checks receipt execution details, and reads canonical case state and history. It does not broadcast transactions. The signed browser lifecycle scripts perform writes only when explicitly guarded and never retry an uncertain broadcast.

## Reproduction

```powershell
python -m pip install -r requirements-dev.txt
python -m pytest -q
python -m genvm_linter.cli lint contracts/shiftfair.py
npm ci
npm run verify:live
```

```powershell
cd web
npm ci
npm run check
npm test
npm run build
$env:APP_URL='https://shiftfair-genlayer.vercel.app'
npm run test:browser
npm run test:registry-browser
```
