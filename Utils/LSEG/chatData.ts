import fs from 'fs';
import path from 'path';
import { lsegConfig } from './config';

/** Informal 1:1 trade-reconciliation chat (user1 <-> user2). */
export const I2I_SCRIPT = [
  'Hey Abhishek, did the EUR/USD confirms come through on your side? 🙂',
  'Hi Avinash, yes just got them - tallying against our blotter now. 👍',
  "Nice. Flag anything that doesn't line up and I'll chase it.",
  "Will do. One trade shows a 2bps diff, checking if it's rounding. 🔎",
  "Sounds like rounding, but let's confirm before EOD. 🙏",
  "Agreed, I'll ping you once it's reconciled. 👌",
];

/** 3-way cross-firm bilateral block-trade conversation. */
export const BLC_SCRIPT = [
  "Morning all, opening the bilateral for today's block trades. 📄",
  "Morning - I've uploaded our side of the confirms. 👍",
  'Thanks both, settlement instructions look consistent on our end. ✅',
  'Great. Any breaks on the notional for the second tranche?',
  'None here, notional matches to the cent. 💯',
  'Same, all clear from compliance - good to proceed. 🙌',
];

/** Managed-chat-room desk/compliance conversation. */
export const MCR_SCRIPT = [
  "Logging today's desk activity in the managed room for the record. 🗂️",
  'Noted. All voice and chat orders captured for the morning session. ✅',
  'Any client instructions that need a second sign-off?',
  'One large order - routing it for supervisory approval now. 🔏',
  'Perfect, keep it minuted here so the audit trail is complete. 🧾',
  'Done - timestamped and archived. 📌',
];

export const ATTACHMENT_FILES = [
  'sample_image.png',
  'sample_document.pdf',
  'sample_text.txt',
  'sample_data.csv',
];

export function attachmentPath(fileName: string): string {
  const p = path.join(lsegConfig.attachmentsDir, fileName);
  if (!fs.existsSync(p)) {
    throw new Error(`LSEG attachment not found: ${p} (check LSEG_ATTACHMENTS_DIR)`);
  }
  return p;
}

/** Leading ASCII portion of a message (up to the first non-ASCII char), max 25 chars, for robust matching. */
export function plainPrefix(s: string): string {
  let end = s.length;
  for (let i = 0; i < s.length; i++) {
    if (s.charCodeAt(i) > 127) {
      end = i;
      break;
    }
  }
  const p = s.slice(0, end).trim();
  return p.length > 25 ? p.slice(0, 25) : p;
}
