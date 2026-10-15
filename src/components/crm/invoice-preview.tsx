// Ported from live chunk crm.invoices-CGKC86lD.js (Ae). Printable invoice sheet plus the iframe print helper.
import type { Invoice } from "@/components/crm/invoice-types";

export function InvoicePreview({ invoice, className = "" }: { invoice: Invoice; className?: string }) {
  const dark = invoice.theme === "black";
  const currency = invoice.currency || "USD";
  const fmt = (n: number) =>
    new Intl.NumberFormat("en-US", { style: "currency", currency, minimumFractionDigits: 2 }).format(n);
  const pd = invoice.paymentDetails;
  const filledFields = (invoice.customFields ?? []).filter((f) => f.label.trim() || f.value.trim());

  return (
    <div
      id="invoice-printable-sheet"
      className={`relative mx-auto w-full max-w-4xl rounded-xl transition-all duration-300 p-8 sm:p-12 shadow-sm font-sans ${dark ? "bg-stone-950 text-stone-100 border border-stone-800 invoice-theme-black" : "bg-white text-stone-900 border border-stone-200 invoice-theme-white"} ${className}`}
    >
      <div className="flex flex-col sm:flex-row justify-between items-start gap-6 border-b pb-8 border-current/15">
        <div className="flex items-start gap-4">
          {invoice.sender.logoUrl ? (
            <img
              src={invoice.sender.logoUrl}
              alt="Logo"
              className="h-14 w-auto max-w-[160px] object-contain rounded"
            />
          ) : (
            <div
              className={`flex h-14 w-14 items-center justify-center rounded-lg font-bold text-xl tracking-tight shadow-sm ${dark ? "bg-stone-800 text-stone-100" : "bg-stone-100 text-stone-900"}`}
            >
              {invoice.sender.companyName ? invoice.sender.companyName.charAt(0).toUpperCase() : "B"}
            </div>
          )}
          <div>
            <h1 className="text-xl font-bold tracking-tight">{invoice.sender.companyName || "Your Company"}</h1>
            {invoice.sender.businessNumber && (
              <p className="text-[12px] opacity-75 font-medium mt-0.5">
                Tax/GST: <span className="font-mono">{invoice.sender.businessNumber}</span>
              </p>
            )}
            <div className="mt-1 text-[12px] opacity-80 leading-relaxed max-w-xs">
              {invoice.sender.address && <div>{invoice.sender.address}</div>}
              <div>{[invoice.sender.city, invoice.sender.state, invoice.sender.pinCode].filter(Boolean).join(", ")}</div>
              {invoice.sender.country && <div>{invoice.sender.country}</div>}
              <div className="mt-1 text-[11px] opacity-75">
                {[invoice.sender.email, invoice.sender.phone, invoice.sender.website].filter(Boolean).join(" • ")}
              </div>
            </div>
          </div>
        </div>
        <div className="sm:text-right">
          <div
            className={`inline-block px-3 py-1 text-xs font-semibold uppercase tracking-wider rounded-md mb-2 ${dark ? "bg-amber-400/20 text-amber-300 border border-amber-400/30" : "bg-stone-900 text-white"}`}
          >
            Invoice
          </div>
          <div className="text-2xl font-bold tracking-tight font-mono">{invoice.invoiceNumber || "#INV-0001"}</div>
          <div className="mt-2 space-y-1 text-xs opacity-85">
            <div>
              <span className="opacity-60">Issue Date: </span>
              <span className="font-medium">{invoice.issueDate || "-"}</span>
            </div>
            <div>
              <span className="opacity-60">Due Date: </span>
              <span className="font-medium">{invoice.dueDate || "-"}</span>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 my-8">
        <div>
          <span className="text-[11px] uppercase tracking-wider font-semibold opacity-60">Billed To</span>
          <div className="mt-1.5">
            <h2 className="text-base font-semibold">{invoice.client.companyName || "Client Name / Company"}</h2>
            {invoice.client.contactPerson && (
              <p className="text-xs opacity-80 mt-0.5">Attn: {invoice.client.contactPerson}</p>
            )}
            <div className="mt-1 text-xs opacity-80 leading-relaxed">
              {invoice.client.address && <div>{invoice.client.address}</div>}
              <div>{[invoice.client.city, invoice.client.state, invoice.client.pinCode].filter(Boolean).join(", ")}</div>
              {invoice.client.country && <div>{invoice.client.country}</div>}
              {invoice.client.email && <div className="mt-0.5">{invoice.client.email}</div>}
              {invoice.client.phone && <div>{invoice.client.phone}</div>}
              {invoice.client.taxNumber && (
                <div className="text-[11px] opacity-75 mt-1">
                  Tax/GST: <span className="font-mono">{invoice.client.taxNumber}</span>
                </div>
              )}
            </div>
          </div>
        </div>
        {(pd.accountNumber || pd.upiId || pd.instructions || invoice.lutNumber) && (
          <div
            className={`rounded-lg p-4 text-xs max-w-sm ${dark ? "bg-stone-900 border border-stone-800" : "bg-stone-50 border border-stone-100"}`}
          >
            <span className="text-[11px] uppercase tracking-wider font-semibold opacity-70">
              Pay via bank transfer {invoice.currency ? `(${invoice.currency})` : ""}
            </span>
            <div className="mt-2 space-y-1 text-[11px] opacity-90">
              {pd.paymentMethod && (
                <div>
                  Payment method: <span className="font-medium">{pd.paymentMethod}</span>
                </div>
              )}
              {invoice.currency && (
                <div>
                  Account currency: <span className="font-mono font-medium">{invoice.currency}</span>
                </div>
              )}
              {pd.accountNumber && (
                <div>
                  Account number: <span className="font-mono font-medium">{pd.accountNumber}</span>
                </div>
              )}
              {pd.routingNumber && (
                <div>
                  ACH routing number: <span className="font-mono font-medium">{pd.routingNumber}</span>
                </div>
              )}
              {pd.wireRoutingNumber && (
                <div>
                  Fedwire routing number: <span className="font-mono font-medium">{pd.wireRoutingNumber}</span>
                </div>
              )}
              {pd.ifscOrSwift && (
                <div>
                  SWIFT / IFSC: <span className="font-mono font-medium">{pd.ifscOrSwift}</span>
                </div>
              )}
              {pd.accountType && (
                <div>
                  Account type: <span className="font-medium">{pd.accountType}</span>
                </div>
              )}
              {pd.bankName && (
                <div>
                  Bank name: <span className="font-medium">{pd.bankName}</span>
                </div>
              )}
              {pd.beneficiaryAddress && (
                <div>
                  Beneficiary address: <span>{pd.beneficiaryAddress}</span>
                </div>
              )}
              {pd.accountHolder && (
                <div>
                  Account holder name: <span className="font-medium">{pd.accountHolder}</span>
                </div>
              )}
              {pd.upiId && (
                <div>
                  UPI ID: <span className="font-mono font-medium">{pd.upiId}</span>
                </div>
              )}
              {pd.instructions && (
                <div className="pt-1 text-[10.5px] opacity-75 italic leading-relaxed">{pd.instructions}</div>
              )}
            </div>
            {invoice.lutNumber && (
              <div className="mt-3 flex items-center justify-between border-t border-current/15 pt-2 text-[11px]">
                <span className="font-mono font-semibold tracking-wider text-emerald-600 dark:text-emerald-400">
                  {invoice.lutNumber}
                </span>
                <span className="text-[10px] font-bold tracking-widest uppercase rounded px-1.5 py-0.5 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                  LUT
                </span>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="overflow-x-auto my-6">
        <table className="w-full text-left text-xs border-collapse">
          <thead>
            <tr
              className={`border-b border-t text-[11px] uppercase tracking-wider ${dark ? "border-stone-800 text-stone-400 bg-stone-900/60" : "border-stone-200 text-stone-500 bg-stone-50"}`}
            >
              <th className="py-3 px-3 w-8">#</th>
              <th className="py-3 px-3">Description</th>
              <th className="py-3 px-3 text-right w-16">Qty</th>
              <th className="py-3 px-3 text-right w-24">Rate</th>
              <th className="py-3 px-3 text-right w-24">Tax / GST</th>
              <th className="py-3 px-3 text-right w-28">Amount</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-current/10">
            {invoice.items.length === 0 ? (
              <tr>
                <td colSpan={6} className="py-6 text-center text-xs opacity-50 italic">
                  No line items added yet.
                </td>
              </tr>
            ) : (
              invoice.items.map((item, i) => {
                const tax =
                  item.taxType === "gst"
                    ? `GST ${item.gstRate}%`
                    : item.taxType === "custom"
                      ? `Tax ${item.customTaxRate}%`
                      : "-";
                return (
                  <tr key={item.id || i}>
                    <td className="py-3 px-3 opacity-60 font-mono text-[11px]">{i + 1}</td>
                    <td className="py-3 px-3 font-medium">{item.description || "Service item"}</td>
                    <td className="py-3 px-3 text-right font-mono">{item.quantity}</td>
                    <td className="py-3 px-3 text-right font-mono">{fmt(item.rate)}</td>
                    <td className="py-3 px-3 text-right opacity-80 font-mono text-[11px]">{tax}</td>
                    <td className="py-3 px-3 text-right font-semibold font-mono">{fmt(item.amount)}</td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <div className="flex flex-col sm:flex-row justify-between items-start gap-6 border-t pt-6 border-current/15">
        <div className="max-w-md space-y-4 text-xs opacity-80">
          {invoice.notes && (
            <div>
              <span className="font-semibold block text-[11px] uppercase tracking-wider opacity-70">Notes</span>
              <p className="mt-1 whitespace-pre-line leading-relaxed">{invoice.notes}</p>
            </div>
          )}
          {filledFields.length ? (
            <div className="space-y-2">
              <span className="font-semibold block text-[11px] uppercase tracking-wider opacity-70">
                Additional Details
              </span>
              {filledFields.map((f) => (
                <div key={f.id}>
                  <span className="font-semibold">{f.label || "Detail"}:</span> <span>{f.value}</span>
                </div>
              ))}
            </div>
          ) : null}
          {(invoice.signatureText || invoice.signatureImage) && (
            <div className={`pt-4 mt-4 ${filledFields.length ? "border-t border-current/15" : ""}`}>
              <span className="font-semibold block text-[11px] uppercase tracking-wider opacity-70">
                Authorized Signature
              </span>
              {invoice.signatureImage ? (
                <img
                  src={invoice.signatureImage}
                  alt="Authorized signature"
                  className="mt-2 max-h-16 max-w-48 object-contain object-left"
                />
              ) : null}
              {invoice.signatureText ? (
                <div className="mt-2 font-sans not-italic font-medium text-base">{invoice.signatureText}</div>
              ) : null}
            </div>
          )}
          {invoice.terms && (
            <div>
              <span className="font-semibold block text-[11px] uppercase tracking-wider opacity-70">
                Terms & Conditions
              </span>
              <p className="mt-1 whitespace-pre-line leading-relaxed text-[11px]">{invoice.terms}</p>
            </div>
          )}
        </div>
        <div className="w-full sm:w-72 space-y-2 text-xs">
          <div className="flex justify-between py-1">
            <span className="opacity-70">Subtotal:</span>
            <span className="font-mono font-medium">{fmt(invoice.subtotal)}</span>
          </div>
          {invoice.discount > 0 && (
            <div className="flex justify-between py-1 text-emerald-600 dark:text-emerald-400">
              <span>Discount:</span>
              <span className="font-mono font-medium">-{fmt(invoice.discount)}</span>
            </div>
          )}
          {invoice.cgstTotal > 0 && (
            <div className="flex justify-between py-1 opacity-80">
              <span>CGST:</span>
              <span className="font-mono">{fmt(invoice.cgstTotal)}</span>
            </div>
          )}
          {invoice.sgstTotal > 0 && (
            <div className="flex justify-between py-1 opacity-80">
              <span>SGST:</span>
              <span className="font-mono">{fmt(invoice.sgstTotal)}</span>
            </div>
          )}
          {invoice.cessTotal > 0 && (
            <div className="flex justify-between py-1 opacity-80">
              <span>Cess:</span>
              <span className="font-mono">{fmt(invoice.cessTotal)}</span>
            </div>
          )}
          {invoice.totalTax > 0 && invoice.cgstTotal === 0 && invoice.sgstTotal === 0 && (
            <div className="flex justify-between py-1 opacity-80">
              <span>Tax:</span>
              <span className="font-mono">{fmt(invoice.totalTax)}</span>
            </div>
          )}
          <div
            className={`flex justify-between border-t-2 pt-3 text-base font-bold tracking-tight ${dark ? "border-stone-700 text-stone-100" : "border-stone-900 text-stone-900"}`}
          >
            <span>Total:</span>
            <span className="font-mono text-lg">{fmt(invoice.grandTotal)}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Prints #invoice-printable-sheet through a hidden iframe.
 * "editor" uses a full-bleed A4 page; "dialog" uses 10mm margins (matches the quick preview dialog).
 */
export function printInvoiceSheet(title: string, dark: boolean, variant: "editor" | "dialog") {
  const sheet = document.getElementById("invoice-printable-sheet");
  if (!sheet) {
    window.print();
    return;
  }
  const frame = document.createElement("iframe");
  frame.style.position = "fixed";
  frame.style.right = "0";
  frame.style.bottom = "0";
  frame.style.width = "0";
  frame.style.height = "0";
  frame.style.border = "none";
  document.body.appendChild(frame);
  const doc = frame.contentWindow?.document;
  if (!doc) {
    window.print();
    return;
  }
  let styles = "";
  document.querySelectorAll('link[rel="stylesheet"], style').forEach((el) => {
    styles += el.outerHTML;
  });
  const bg = dark ? "#0c0a09" : "#ffffff";
  const fg = dark ? "#f5f5f4" : "#1c1917";
  const pageCss =
    variant === "editor"
      ? `
            @page {
              size: A4 portrait;
              margin: 0;
            }
            html, body {
              margin: 0 !important;
              padding: 0 !important;
              width: 210mm !important;
              min-height: 297mm !important;
              background-color: ${bg} !important;
              color: ${fg} !important;
              -webkit-print-color-adjust: exact !important;
              print-color-adjust: exact !important;
            }
            #invoice-printable-sheet {
              width: 100% !important;
              max-width: 100% !important;
              margin: 0 auto !important;
              box-sizing: border-box !important;
              min-height: 297mm !important;
              padding: 12mm !important;
              box-shadow: none !important;
              border: none !important;
              border-radius: 0 !important;
              print-color-adjust: exact !important;
              -webkit-print-color-adjust: exact !important;
            }`
      : `
            @page {
              size: A4 portrait;
              margin: 10mm;
            }
            html, body {
              margin: 0 !important;
              padding: 0 !important;
              background-color: ${bg} !important;
              color: ${fg} !important;
              -webkit-print-color-adjust: exact !important;
              print-color-adjust: exact !important;
            }
            #invoice-printable-sheet {
              width: 100% !important;
              max-width: 100% !important;
              margin: 0 auto !important;
              padding: 20px 24px !important;
              box-shadow: none !important;
              border: none !important;
            }`;
  doc.open();
  doc.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>${title}</title>
          ${styles}
          <style>${pageCss}
          </style>
        </head>
        <body class="${dark ? "dark" : ""}">
          ${sheet.outerHTML}
        </body>
      </html>
    `);
  doc.close();
  setTimeout(() => {
    frame.contentWindow?.focus();
    frame.contentWindow?.print();
    setTimeout(() => {
      document.body.removeChild(frame);
    }, 1000);
  }, 250);
}
