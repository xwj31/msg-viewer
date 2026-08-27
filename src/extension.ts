import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import MsgReader from '@kenjiuno/msgreader';
import { FieldsData, AttachmentData } from '@kenjiuno/msgreader';

export function activate(context: vscode.ExtensionContext) {
  context.subscriptions.push(
    vscode.commands.registerCommand('msgViewer.preview', (uri?: vscode.Uri) => {
      if (!uri) {
        const editor = vscode.window.activeTextEditor;
        if (!editor) return;
        uri = editor.document.uri;
      }
      vscode.commands.executeCommand('vscode.openWith', uri, 'msgViewer.preview');
    })
  );

  context.subscriptions.push(
    vscode.window.registerCustomEditorProvider(
      'msgViewer.preview',
      new MsgEditorProvider()
    )
  );

  context.subscriptions.push(
    vscode.lm.registerMcpServerDefinitionProvider('msgViewer.mcp', {
      provideMcpServerDefinitions: () => [
        new vscode.McpStdioServerDefinition(
          'MSG Viewer',
          process.execPath,
          [context.asAbsolutePath(path.join('out', 'mcp.js'))],
          // The extension host's execPath is Electron; this makes it behave as plain Node
          { ELECTRON_RUN_AS_NODE: '1' }
        ),
      ],
    })
  );
}

class MsgEditorProvider implements vscode.CustomReadonlyEditorProvider {
  openCustomDocument(
    uri: vscode.Uri,
    _openContext: vscode.CustomDocumentOpenContext,
    _token: vscode.CancellationToken
  ): vscode.CustomDocument {
    return { uri, dispose: () => {} };
  }

  async resolveCustomEditor(
    document: vscode.CustomDocument,
    webviewPanel: vscode.WebviewPanel,
    _token: vscode.CancellationToken
  ): Promise<void> {
    const uri = document.uri;
    const buf = fs.readFileSync(uri.fsPath);

    // MsgReader accepts ArrayBuffer
    const reader = new MsgReader(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
    const info = reader.getFileData();

    // Build attachments
    const attachments: Array<{ fileName: string; content: string; pidContentId?: string }> = [];
    const cidMap: Record<string, string> = {};

    if (info.attachments) {
      for (const att of info.attachments) {
        try {
          const data = reader.getAttachment(att);
          const ext = (att.fileNameShort || att.fileName || 'file').split('.').pop()?.toLowerCase() || 'bin';
          const mime = mimeFromExt(ext);
          const base64 = Buffer.from(data.content).toString('base64');
          const dataUri = `data:${mime};base64,${base64}`;
          attachments.push({ fileName: att.fileName || att.fileNameShort || 'unknown', content: dataUri, pidContentId: att.pidContentId });
          if (att.pidContentId) {
            cidMap[att.pidContentId.replace(/[<>]/g, '')] = dataUri;
          }
        } catch (e) {
          // skip problematic attachments
        }
      }
    }

    // Get HTML body (prefer bodyHtml string, fall back to binary html field)
    let bodyHtml = info.bodyHtml || '';
    if (info.html && info.html.length > 0 && !bodyHtml) {
      bodyHtml = new TextDecoder().decode(info.html);
    }

    // Resolve cid: references in HTML body to data URIs
    if (bodyHtml && Object.keys(cidMap).length > 0) {
      for (const [cid, dataUri] of Object.entries(cidMap)) {
        bodyHtml = bodyHtml.replace(
          new RegExp(`cid:${escapeRegex(cid)}`, 'gi'),
          dataUri
        );
      }
    }

    // Strip hardcoded text colors from the HTML body for dark theme compatibility
    if (bodyHtml) {
      bodyHtml = stripHardcodedTextColors(bodyHtml);
    }

    const html = buildPreviewHtml(info, bodyHtml, attachments);
    webviewPanel.webview.html = html;
  }
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function mimeFromExt(ext: string): string {
  const map: Record<string, string> = {
    jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png',
    gif: 'image/gif', webp: 'image/webp', svg: 'image/svg+xml',
    bmp: 'image/bmp', pdf: 'application/pdf',
    txt: 'text/plain', html: 'text/html', htm: 'text/html',
    doc: 'application/msword', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    xls: 'application/vnd.ms-excel', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  };
  return map[ext] || 'application/octet-stream';
}

function buildPreviewHtml(
  info: FieldsData,
  bodyHtml: string,
  attachments: Array<{ fileName: string; content: string }>
): string {
  const subject = esc(info.subject || '(no subject)');
  const senderName = esc(info.senderName || '');
  const senderEmail = esc(info.senderEmail || '');
  const toList = (info.recipients || [])
    .filter((r: any) => r.recipType === 'to')
    .map((r: any) => esc(r.name || r.email || ''));
  const ccList = (info.recipients || [])
    .filter((r: any) => r.recipType === 'cc')
    .map((r: any) => esc(r.name || r.email || ''));
  const date = info.clientSubmitTime || info.messageDeliveryTime || '';
  const bodyText = esc(info.body || '').replace(/\n/g, '<br>');

  let displayBody = bodyHtml;
  let hasHtml = !!bodyHtml;
  if (!displayBody) {
    displayBody = `<pre style="font-family: inherit; white-space: pre-wrap; margin:0">${bodyText}</pre>`;
  }

  let attSection = '';
  if (attachments.length > 0) {
    const items = attachments.map((a, i) => {
      const isImage = a.content.startsWith('data:image/');
      if (isImage) {
        return `<div class="att-item">
          <span class="att-name">${esc(a.fileName)}</span>
          <img src="${a.content}" alt="${esc(a.fileName)}" style="max-width:100%;max-height:400px;display:block;margin-top:4px;border:1px solid var(--vscode-widget-border,#ccc);border-radius:4px" />
        </div>`;
      }
      return `<div class="att-item">
        <span class="att-name">${esc(a.fileName)}</span>
        <a href="${a.content}" download="${esc(a.fileName)}">Download</a>
      </div>`;
    }).join('\n');
    attSection = `<div class="section"><h3>Attachments (${attachments.length})</h3>${items}</div>`;
  }

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8">
<style>
  body {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
    font-size: 14px; line-height: 1.5;
    padding: 16px 24px;
    color: var(--vscode-editor-foreground, #333);
    background: var(--vscode-editor-background, #fff);
    max-width: 900px; margin: 0 auto;
  }
  h1 { font-size: 20px; margin: 0 0 12px 0; }
  .field { margin: 2px 0; display: flex; }
  .field-label { color: var(--vscode-textPreformat-foreground, #888); min-width: 80px; flex-shrink: 0; }
  .section { margin: 20px 0; }
  .section h3 { font-size: 15px; margin: 0 0 8px 0; color: var(--vscode-textPreformat-foreground, #666); border-bottom: 1px solid var(--vscode-widget-border, #ddd); padding-bottom: 4px; }
  .body-wrap {
    border: 1px solid var(--vscode-widget-border, #ddd);
    border-radius: 6px;
    padding: 16px;
    background: transparent;
    color: inherit;
  }
  .body-wrap * { color: inherit !important; background: transparent !important; }
  .body-wrap table, .body-wrap td, .body-wrap tr {
    background: transparent !important;
    color: inherit !important;
  }
  .body-wrap img { max-width: 100%; height: auto; }
  .att-item { padding: 6px 0; border-bottom: 1px solid var(--vscode-widget-border, #eee); }
  .att-name { font-weight: 500; }
  .tabs { display: flex; gap: 4px; margin-bottom: 12px; }
  .tab {
    padding: 4px 14px;
    border: 1px solid var(--vscode-widget-border, #ccc);
    border-radius: 4px;
    cursor: pointer;
    font-size: 13px;
    background: transparent;
    color: var(--vscode-editor-foreground, #333);
  }
  .tab.active {
    background: var(--vscode-badge-background, #e0e0e0);
    font-weight: 600;
  }
  .tab:hover { background: var(--vscode-list-hoverBackground, #f0f0f0); }
</style></head>
<body>
  <h1>${subject}</h1>
  <div class="field"><span class="field-label">From:</span> <span>${senderName} &lt;${senderEmail}&gt;</span></div>
  ${toList.length ? `<div class="field"><span class="field-label">To:</span> <span>${toList.join('; ')}</span></div>` : ''}
  ${ccList.length ? `<div class="field"><span class="field-label">Cc:</span> <span>${ccList.join('; ')}</span></div>` : ''}
  ${date ? `<div class="field"><span class="field-label">Date:</span> <span>${esc(date)}</span></div>` : ''}

  ${hasHtml ? `<div class="tabs">
    <button class="tab active" onclick="switchTab('html')">HTML</button>
    <button class="tab" onclick="switchTab('text')">Plain Text</button>
  </div>` : ''}

  <div class="section">
    <div id="body-html" class="body-wrap">${displayBody}</div>
    ${hasHtml ? `<div id="body-text" class="body-wrap" style="display:none"><pre style="font-family:inherit;white-space:pre-wrap;margin:0">${bodyText}</pre></div>` : ''}
  </div>

  ${attSection}

  ${info.headers ? `<div class="section" style="font-size:12px;color:var(--vscode-textPreformat-foreground,#999);">
    <hr style="border:none;border-top:1px solid var(--vscode-widget-border,#ddd)">
    <p>${esc(info.headers || '').split('\\n').slice(0, 10).join('<br>')}</p>
  </div>` : ''}

<script>
  function switchTab(type) {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    document.getElementById('body-html').style.display = type === 'html' ? 'block' : 'none';
    document.getElementById('body-text').style.display = type === 'text' ? 'block' : 'none';
    var t = document.querySelector('.tabs button:first-child');
    t.classList.toggle('active', type === 'html');
    document.querySelector('.tabs button:last-child').classList.toggle('active', type === 'text');
  }
</script>
</body>
</html>`;
}

function esc(s: string | undefined | null): string {
  if (!s) return '';
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/**
 * Strip hardcoded CSS `color` values from the email HTML body
 * so text is readable on both light and dark themes.
 *
 * Keeps only: inherit, transparent, unset, var(--*) — kills everything else.
 */
function stripHardcodedTextColors(html: string): string {
  // Strip color from inline style attributes
  return html.replace(
    /(?:color|background(?:-color)?)\s*:\s*(?:rgb\([^)]*\)|#[0-9a-fA-F]{3,8}|hsl\([^)]*\)|[a-z]+)/g,
    (match) => {
      const key = match.split(':')[0].trim().toLowerCase();
      // Keep 'inherit', 'transparent', 'unset', and 'var(--*)' but nuke absolute colors
      const val = match.split(':')[1]?.trim() || '';
      if (val === 'inherit' || val === 'transparent' || val === 'unset' || val.startsWith('var(--')) {
        return match;
      }
      // Only nuke foreground colors, keep backgrounds transparent
      if (key === 'color' || key === 'background-color') {
        return `${key}: inherit; /* stripped for dark theme */`;
      }
      return match;
    }
  );
}