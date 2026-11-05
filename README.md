# Compliance Central Automation

Playwright (TypeScript) automation for Compliance Central integrations. One folder per integration.

```
Page/LSEG/       LsegMessenger page object (one instance per logged-in user)
Utils/LSEG/      config, test data, Excel test-case loader
Test/LSEG/       specs
Test-Data/LSEG/  attachments + lseg-testgen Excel workbook
```

## Setup
```
npm install
npx playwright install chromium
cp .env.example .env   # fill in credentials
```

## Run
```
npm run test:lseg            # headless
npm run test:lseg:headed
npm run report
```

## LSEG
`Test/LSEG/lseg-chat-flow.spec.ts` ports `LsegChatFlowTest` from the Java/TestNG project:
3 users log in (separate browser contexts), then BLC / I2I / MCR threaded conversations with
attachments, followed by one test per row of the Excel workbook (`LSEG_EXCEL_TESTCASES_PATH`).
TC-012 exercises the active chat's **Send a buzz** toolbar action. Scenarios with no automated UI
action yet are reported as skipped, not faked.
