/**
 * Utility for printing formatted PDF/Documents across all browser environments and iframe previews
 */

export function escapeHtml(str: any): string {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function sanitizeHtml(html: string): string {
  if (!html) return '';
  return html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/\s*on\w+\s*=\s*(['"]).*?\1/gi, '')
    .replace(/\s*on\w+\s*=\s*[^>\s]+/gi, '')
    .replace(/javascript:/gi, '');
}

export interface PrintOptions {
  pageSize?: 'A4' | 'A5' | 'half-A4' | 'auto';
  hideDefaultHeader?: boolean;
}

export const printFormattedDocument = (
  title: string,
  contentHtml: string,
  options?: PrintOptions
) => {
  const safeTitle = escapeHtml(title);
  const safeContent = sanitizeHtml(contentHtml);
  const isA5 = options?.pageSize === 'A5' || options?.pageSize === 'half-A4' || title.toLowerCase().includes('payslip');
  const hideBanner = options?.hideDefaultHeader ?? isA5;

  // Method 1: Try Popup Window
  try {
    const printWin = window.open('', '_blank', isA5 ? 'width=460,height=650' : 'width=900,height=1000');
    if (printWin && !printWin.closed) {
      printWin.document.write(`
        <!DOCTYPE html>
        <html>
          <head>
            <title>${safeTitle}</title>

            <style>
              @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800;900&family=JetBrains+Mono:wght@400;600;700&display=swap');
              
              * { box-sizing: border-box; }
              body {
                font-family: 'Inter', system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                color: #0f172a;
                padding: ${isA5 ? '8px 12px' : '32px'};
                background: #ffffff;
                margin: 0;
                line-height: 1.4;
              }
              .font-mono { font-family: 'JetBrains Mono', monospace; }

              /* A5 Dimension Standards: 148mm x 210mm (14.8 x 21.0 cm / 5.83 x 8.27 in) */
              /* Screen: ~419 x 595 px (72 DPI) | Print: 1748 x 2480 px (300 DPI) */
              .a5-container, .a5-sheet {
                width: 100%;
                max-width: 148mm;
                margin: 0 auto;
                box-sizing: border-box;
                font-family: 'Inter', system-ui, -apple-system, sans-serif;
              }
              
              .header-banner {
                display: ${hideBanner ? 'none' : 'flex'};
                align-items: center;
                justify-content: space-between;
                border-bottom: 2px solid #2563eb;
                padding-bottom: 16px;
                margin-bottom: 24px;
              }
              .brand-title {
                font-size: 22px;
                font-weight: 900;
                color: #0f172a;
                letter-spacing: -0.02em;
              }
              .brand-sub {
                font-size: 11px;
                font-weight: 700;
                color: #2563eb;
                text-transform: uppercase;
                letter-spacing: 0.05em;
              }
              .doc-title {
                font-size: 18px;
                font-weight: 800;
                color: #1e293b;
                margin-bottom: 12px;
              }
              table {
                width: 100%;
                border-collapse: collapse;
                margin-top: 16px;
                font-size: 12px;
              }
              th {
                background: #f8fafc;
                text-align: left;
                padding: 10px 12px;
                font-weight: 700;
                color: #475569;
                border-bottom: 2px solid #e2e8f0;
                text-transform: uppercase;
                font-size: 10px;
                letter-spacing: 0.05em;
              }
              td {
                padding: 10px 12px;
                border-bottom: 1px solid #f1f5f9;
                color: #334155;
              }
              .text-right { text-align: right; }
              .text-center { text-align: center; }
              .font-bold { font-weight: 700; }
              .font-black { font-weight: 900; }
              
              .badge {
                display: inline-block;
                padding: 3px 8px;
                border-radius: 6px;
                font-size: 10px;
                font-weight: 700;
                text-transform: uppercase;
              }
              .bg-emerald { background: #ecfdf5; color: #047857; }
              .bg-rose { background: #fff1f2; color: #be123c; }
              .bg-blue { background: #eff6ff; color: #1d4ed8; }
              
              .total-box {
                background: #eff6ff;
                border: 1px solid #bfdbfe;
                border-radius: 12px;
                padding: 16px;
                margin-top: 24px;
                display: flex;
                justify-content: space-between;
                align-items: center;
                font-size: 15px;
                font-weight: 800;
                color: #1e3a8a;
              }

              .footer-note {
                font-size: 10px;
                color: #94a3b8;
                margin-top: 40px;
                border-top: 1px solid #f1f5f9;
                padding-top: 12px;
                text-align: center;
              }

              .payslip-page {
                page-break-after: always;
                break-after: page;
                break-inside: avoid;
                margin-bottom: 24px;
              }
              .payslip-page:last-child {
                page-break-after: auto;
                break-after: auto;
                margin-bottom: 0;
              }

              @media print {
                @page {
                  size: ${isA5 ? '148mm 210mm' : 'auto'}; /* Exact A5: 148mm x 210mm (14.8cm x 21.0cm / 5.83in x 8.27in) */
                  margin: ${isA5 ? '5mm 6mm' : '12mm'};
                }
                body {
                  padding: 0;
                  font-family: 'Inter', system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                }
                .a5-container, .a5-sheet {
                  width: 148mm !important;
                  max-width: 148mm !important;
                  margin: 0 auto !important;
                }
                .payslip-page {
                  page-break-after: always !important;
                  break-after: page !important;
                  break-inside: avoid !important;
                  margin-bottom: 0 !important;
                }
                .payslip-page:last-child {
                  page-break-after: auto !important;
                  break-after: auto !important;
                }
              }
            </style>
          </head>
          <body>
            ${hideBanner ? '' : `
            <div class="header-banner">
              <div>
                <div class="brand-title">MOHSIN & CO</div>
                <div class="brand-sub">Executive Payroll & Attendance Management System</div>
              </div>
              <div style="text-align: right; font-size: 11px; color: #64748b;">
                <div>Date: ${new Date().toLocaleDateString()}</div>
                <div>Status: Verified Document</div>
              </div>
            </div>
            `}

            ${safeContent}

            ${hideBanner ? '' : `
            <div class="footer-note">
              This is a computer-generated document from Mohsin & Co Payroll System. No signature required.
            </div>
            `}

            <script>
              window.onload = function() {
                setTimeout(function() {
                  window.focus();
                  window.print();
                }, 250);
              };
            </script>
          </body>
        </html>
      `);
      printWin.document.close();
      return;
    }
  } catch (e) {
    console.warn('Popup window blocked or error:', e);
  }

  // Method 2: Hidden iFrame Fallback (if popups are blocked by iframe sandbox)
  const existingFrame = document.getElementById('printable-hidden-frame');
  if (existingFrame) existingFrame.remove();

  const iframe = document.createElement('iframe');
  iframe.id = 'printable-hidden-frame';
  iframe.style.position = 'fixed';
  iframe.style.right = '0';
  iframe.style.bottom = '0';
  iframe.style.width = '0';
  iframe.style.height = '0';
  iframe.style.border = '0';
  document.body.appendChild(iframe);

  const doc = iframe.contentWindow?.document;
  if (doc) {
    doc.open();
    doc.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>${safeTitle}</title>
          <style>
            @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800;900&family=JetBrains+Mono:wght@400;600;700&display=swap');
            @page { size: ${isA5 ? '148mm 210mm' : 'auto'}; margin: ${isA5 ? '5mm 6mm' : '12mm'}; }
            body { font-family: 'Inter', system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; color: #0f172a; padding: ${isA5 ? '8px 12px' : '20px'}; margin: 0; }
            .a5-container, .a5-sheet { width: 100%; max-width: 148mm; margin: 0 auto; box-sizing: border-box; font-family: 'Inter', system-ui, -apple-system, sans-serif; }
            table { width: 100%; border-collapse: collapse; font-size: ${isA5 ? '11px' : '12px'}; font-family: 'Inter', system-ui, -apple-system, sans-serif; }
            th { background: #f8fafc; text-align: left; padding: 6px 8px; font-weight: 700; border-bottom: 2px solid #cbd5e1; }
            td { padding: 6px 8px; border-bottom: 1px solid #e2e8f0; }
            .total-box { background: #eff6ff; border: 1px solid #bfdbfe; padding: 10px; margin-top: 14px; font-weight: 800; font-size: 13px; color: #1e3a8a; }
            .payslip-page { page-break-after: always !important; break-after: page !important; break-inside: avoid !important; margin-bottom: 20px; }
            .payslip-page:last-child { page-break-after: auto !important; break-after: auto !important; margin-bottom: 0; }
          </style>
        </head>
        <body>
          ${hideBanner ? '' : `
          <div style="border-bottom: 2px solid #2563eb; padding-bottom: 10px; margin-bottom: 15px;">
            <h2 style="margin: 0; color: #0f172a;">MOHSIN & CO</h2>
            <p style="margin: 2px 0 0 0; font-size: 11px; color: #2563eb; font-weight: bold;">Executive Payroll & Attendance Management System</p>
          </div>
          `}
          ${safeContent}
        </body>
      </html>
    `);
    doc.close();
    setTimeout(() => {
      try {
        iframe.contentWindow?.focus();
        iframe.contentWindow?.print();
      } catch (err) {
        window.print();
      }
    }, 300);
  } else {
    window.print();
  }
};
