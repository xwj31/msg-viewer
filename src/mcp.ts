#!/usr/bin/env node
/**
 * MCP stdio server exposing Outlook .msg parsing.
 *
 * Runs standalone (`node out/mcp.js`) for any MCP client, and is also
 * registered by the extension via the mcpServerDefinitionProviders
 * contribution so VS Codium's agent integrations pick it up automatically.
 */
import * as fs from 'fs';
import * as path from 'path';
import MsgReader from '@kenjiuno/msgreader';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

const pkgVersion: string = require('../package.json').version;

interface RecipientOut {
  name: string;
  email: string;
}

function readMsgFile(filePath: string) {
  const buf = fs.readFileSync(filePath);
  const reader = new MsgReader(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
  return { reader, info: reader.getFileData() };
}

function mapRecipients(recipients: any[] | undefined, type: string): RecipientOut[] {
  return (recipients || [])
    .filter((r) => r.recipType === type)
    .map((r) => ({ name: r.name || '', email: r.smtpAddress || r.email || '' }));
}

const server = new McpServer({ name: 'msg-viewer', version: pkgVersion });

server.registerTool(
  'read_msg',
  {
    description:
      'Parse an Outlook .msg file and return its metadata and body: subject, sender, To/Cc/Bcc recipients, date, plain-text body, and the list of attachments (with indexes usable by extract_msg_attachment). Set include_html to also get the raw HTML body.',
    inputSchema: {
      path: z.string().describe('Absolute path to the .msg file'),
      include_html: z
        .boolean()
        .optional()
        .describe('Include the raw HTML body in the result (default false)'),
    },
  },
  async ({ path: filePath, include_html }) => {
    const { info } = readMsgFile(filePath);

    let htmlBody = info.bodyHtml || '';
    if (!htmlBody && info.html && info.html.length > 0) {
      htmlBody = new TextDecoder().decode(info.html);
    }

    const result: Record<string, unknown> = {
      subject: info.subject || '',
      senderName: info.senderName || '',
      senderEmail: info.senderSmtpAddress || info.senderEmail || '',
      to: mapRecipients(info.recipients, 'to'),
      cc: mapRecipients(info.recipients, 'cc'),
      bcc: mapRecipients(info.recipients, 'bcc'),
      date: info.clientSubmitTime || info.messageDeliveryTime || '',
      body: info.body || '',
      hasHtmlBody: !!htmlBody,
      attachments: (info.attachments || []).map((att, index) => ({
        index,
        fileName: att.fileName || att.fileNameShort || 'unknown',
        contentId: att.pidContentId || null,
        size: att.contentLength ?? null,
      })),
    };
    if (include_html) {
      result.htmlBody = htmlBody;
    }

    return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
  }
);

server.registerTool(
  'extract_msg_attachment',
  {
    description:
      'Extract one attachment from an Outlook .msg file and write it to disk. Use read_msg first to list attachments and their indexes. Returns the saved file path.',
    inputSchema: {
      path: z.string().describe('Absolute path to the .msg file'),
      index: z.number().int().min(0).describe('Attachment index from read_msg'),
      output_path: z
        .string()
        .optional()
        .describe(
          'Where to write the attachment. Defaults to the attachment file name next to the .msg file. Existing files are overwritten.'
        ),
    },
  },
  async ({ path: filePath, index, output_path }) => {
    const { reader, info } = readMsgFile(filePath);
    const attachments = info.attachments || [];
    const att = attachments[index];
    if (!att) {
      return {
        isError: true,
        content: [
          {
            type: 'text',
            text: `No attachment at index ${index}; the file has ${attachments.length} attachment(s).`,
          },
        ],
      };
    }

    const data = reader.getAttachment(att);
    const fileName = att.fileName || att.fileNameShort || `attachment-${index}`;
    const target = output_path || path.join(path.dirname(filePath), fileName);
    fs.writeFileSync(target, Buffer.from(data.content));

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({ savedTo: target, fileName, bytes: data.content.length }, null, 2),
        },
      ],
    };
  }
);

async function main() {
  await server.connect(new StdioServerTransport());
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
