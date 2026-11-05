import { BrowserContext, test } from '@playwright/test';
import { LsegMessenger } from '../../Page/LSEG/LsegMessenger';
import { ATTACHMENT_FILES, BLC_SCRIPT, I2I_SCRIPT, MCR_SCRIPT, plainPrefix } from '../../Utils/LSEG/chatData';
import { credentialsFor, lsegConfig } from '../../Utils/LSEG/config';
import { LsegExcelTestCase, loadExcelTestCases } from '../../Utils/LSEG/excelTestCases';

/**
 * Live LSEG Messenger chat flow: 3 users in separate browser contexts, BLC / I2I / MCR threaded
 * conversations with attachments, then one test per row of the lseg-testgen Excel workbook.
 */
test.describe.configure({ mode: 'serial' });

let contexts: BrowserContext[] = [];
let user1: LsegMessenger;
let user2: LsegMessenger;
let user3: LsegMessenger;
let excelChatReady = false;

test.beforeAll(async ({ browser }) => {
  test.setTimeout(600_000);
  contexts = await Promise.all([browser.newContext(), browser.newContext(), browser.newContext()]);
  const pages = await Promise.all(contexts.map((c) => c.newPage()));
  [user1, user2, user3] = pages.map(
    (p, i) => new LsegMessenger(p, credentialsFor(i + 1), `user${i + 1}`),
  );
  await Promise.all([user1.login(), user2.login(), user3.login()]);
});

test.afterAll(async () => {
  await Promise.all(contexts.map((c) => c.close()));
});

/**
 * Threaded conversation: first line is a fresh message; each later line is a quote-reply to the
 * previous one by the next user in rotation. Ends with attachments shared in both directions.
 */
async function converse(script: string[], users: LsegMessenger[]): Promise<void> {
  let prev = '';
  for (let i = 0; i < script.length; i++) {
    const sender = users[i % users.length];
    if (i === 0) await sender.sendMessage(script[i]);
    else await sender.replyToMessage(prev, script[i]);
    prev = plainPrefix(script[i]);
  }
  await users[0].shareAttachment(ATTACHMENT_FILES[0]); // image
  if (users.length > 1) {
    await users[1].expectMessageVisible('sample_image');
    await users[1].shareAttachment(ATTACHMENT_FILES[1]); // document
    await users[0].expectMessageVisible('sample_document');
  }
}

test('BLC chat flow', async () => {
  test.setTimeout(300_000);
  const room = lsegConfig.blcChatName;
  await Promise.all([user1, user2, user3].map((u) => u.openChatByName(room)));
  await converse(BLC_SCRIPT, [user1, user2, user3]);
});

test('I2I chat flow', async () => {
  test.setTimeout(300_000);
  await user1.openI2IChat(user2);
  await user2.openI2IChat(user1);
  await converse(I2I_SCRIPT, [user1, user2]);
});

test('MCR chat flow', async () => {
  test.setTimeout(300_000);
  test.skip(!lsegConfig.mcrChatName, 'LSEG_MCR_CHAT_NAME not configured');
  await user1.openChatByName(lsegConfig.mcrChatName);
  await user2.openChatByName(lsegConfig.mcrChatName);
  await converse(MCR_SCRIPT, [user1, user2]);
});

// ── Excel-driven scenarios ────────────────────────────────────────────────────

/** Titles with no automated UI/API hook yet - reported as skipped, not faked. */
const UNMAPPED_TITLE_KEYWORDS = [
  'corrupted file', 'unsupported file type', 'large-size attachment', 'exceeding the configured',
  'delete a message', 'large volumes', 'bulk message ingestion', 'concurrent message processing',
  'peak load', 'search chat/compliance records', 'download a message', 'metadata fields',
  'appearance/formatting', 'archival', 'encryption',
];

const EXT_TO_FILE: Record<string, string> = {
  png: 'sample_image.png',
  pdf: 'sample_document.pdf',
  txt: 'sample_text.txt',
  csv: 'sample_data.csv',
};

const MEDIA_FILES = ['Video_Pitch.mp4', 'Audio.wav'];

/** Replaces @UserA/@UserB/@UserC placeholders with the real display names of the logged-in users. */
function substituteUserPlaceholders(text: string): string {
  return text
    .replace(/@UserA\b/gi, () => `@${user1.displayName}`)
    .replace(/@UserB\b/gi, () => `@${user2.displayName}`)
    .replace(/@UserC\b/gi, () => `@${user3.displayName}`);
}

async function runExcelScenario(tc: LsegExcelTestCase): Promise<void> {
  const title = tc.title.toLowerCase();
  const raw = tc.testData.trim();
  const data = !raw || raw.toLowerCase() === 'n/a' ? null : substituteUserPlaceholders(raw);

  test.skip(
    UNMAPPED_TITLE_KEYWORDS.some((k) => title.includes(k)),
    `No automated LSEG Messenger UI/API action mapped yet for: ${tc.title}`,
  );

  // TC-21: send the suspicious URL from the Excel Test Data and verify it is delivered/surfaced in
  // both views. The compliance/audit flag lives outside the Messenger UI, so it is not asserted here.
  if (title.includes('suspicious or phishing link')) {
    const url = data ?? 'https://secure-lseg-login.verify-account.ru';
    const host = new URL(url).hostname; // the UI may linkify or shorten the scheme, so match on host
    await user1.sendMessage(url);
    await user1.expectMessageVisible(host);
    await user2.expectMessageVisible(host);
    return;
  }

  if (title.includes('buzz')) {
    await user1.sendBuzz();
    return;
  }

  // TC-23: the Excel names sample_video.mp4 / sample_audio.wav; the real files in the attachments
  // folder are Video_Pitch.mp4 / Audio.wav (~13 MB each), so allow extra upload time.
  if (title.includes('video/audio attachment')) {
    for (const file of MEDIA_FILES) {
      await user1.shareAttachment(file, 15_000);
      await user2.expectMessageVisible(file.slice(0, file.lastIndexOf('.')));
    }
    return;
  }

  if (title.includes('image attachments') || title.includes('document attachments')) {
    const lower = tc.testData.toLowerCase();
    const files = [...new Set(Object.entries(EXT_TO_FILE).filter(([ext]) => lower.includes(`.${ext}`)).map(([, f]) => f))];
    test.skip(files.length === 0, `No sample attachment available for: ${tc.testData}`);
    for (const file of files) {
      await user1.shareAttachment(file);
      await user2.expectMessageVisible(file.slice(0, file.lastIndexOf('.')));
    }
    return;
  }

  if (title.includes('reply to an existing message')) {
    const seed = `Reply seed ${tc.id}`;
    await user1.sendMessage(seed);
    const replyText = data ?? 'Replying to your message.';
    await user2.replyToMessage(plainPrefix(seed), replyText);
    await user1.expectMessageVisible(plainPrefix(replyText));
    return;
  }

  if (title.includes('sent message')) {
    const msg = `Sender-view check ${tc.id}`;
    await user1.sendMessage(msg);
    await user1.expectMessageVisible(plainPrefix(msg));
    return;
  }

  if (title.includes('received message')) {
    const msg = `Recipient-view check ${tc.id}`;
    await user1.sendMessage(msg);
    await user2.expectMessageVisible(plainPrefix(msg));
    return;
  }

  if (title.includes('mcr') || title.includes('blc')) {
    const room = title.includes('mcr') ? lsegConfig.mcrChatName : lsegConfig.blcChatName;
    test.skip(!room, 'LSEG_MCR_CHAT_NAME not configured');
    await user1.openChatByName(room);
    await user2.openChatByName(room);
    const msg = data ?? tc.title;
    await user1.sendMessage(msg);
    await user2.expectMessageVisible(plainPrefix(msg));
    return;
  }

  if (title.includes('very large message body')) {
    const msg = 'L'.repeat(10_050);
    await user1.sendMessage(msg);
    await user2.expectMessageVisible(msg.slice(0, 25));
    return;
  }

  // Generic content-validation: send Test Data (or title for procedural rows) and verify delivery.
  const message = data ?? tc.title;
  await user1.sendMessage(message);
  await user2.expectMessageVisible(plainPrefix(message));
}

test.describe('Excel-driven scenarios', () => {
  const rows = loadExcelTestCases(lsegConfig.excelPath);
  if (rows.length === 0) {
    test('no Excel test cases found', () => {
      test.skip(true, `No rows loaded from ${lsegConfig.excelPath}`);
    });
  }
  for (const tc of rows) {
    test(`${tc.id} - ${tc.title}`, async () => {
      test.setTimeout(180_000);
      if (!excelChatReady) {
        await user1.openI2IChat(user2);
        await user2.openI2IChat(user1);
        excelChatReady = true;
      }
      await runExcelScenario(tc);
    });
  }
});
