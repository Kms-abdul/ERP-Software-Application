import React from 'react';
import ReceiptLogo from '../images/Receiptlogo.png';

interface FeeReceiptProps {
  onClose: () => void;
  receiptData: {
    studentName: string;
    fatherName: string;
    fatherPhone: string | number;
    admissionNo: string;
    branch: string;
    className: string;
    receiptNo: string;
    paymentDate: string;
    paymentMode: string;
    paymentNote: string;
    items: { title: string; payable: number }[];
    amount: number;
    concession: number;
    payable: number;
    paid: number;
    due: number;
  };
}

const ReceiptTemplate = ({ data, copyType, logo }: { data: any, copyType: string, logo: string }) => {
  const { studentName, fatherName, fatherPhone, admissionNo, branch, className, receiptNo, paymentDate, paymentMode, paymentNote, items, amount, concession, payable } = data;

  const formatDate = (dateString: string) => {
    if (!dateString) return '';
    const date = new Date(dateString + 'T00:00:00');
    return date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }).replace(/ /g, '-');
  };

  return (
    <div className="receipt-container p-8 text-gray-800 bg-white relative border-b-2 border-dashed border-gray-300 last:border-b-0 pb-12 mb-12">
      {/* Header */}
      <div className="flex items-center justify-start mb-4">
        <img src={logo} alt="School Logo" className="h-16 mr-4" />
        <div>
          <h1 className="text-2xl font-bold text-black">MS Education Academy</h1>
          <p className="text-md text-gray-600">Fee Receipt <span className="text-sm font-semibold ml-2">({copyType})</span></p>
        </div>
      </div>
      <hr className="my-6" />

      {/* Student & Receipt Info */}
      <div className="flex justify-between text-lg mb-2">
        <div>
          <p><strong className="font-semibold w-24 inline-block">Student:</strong> {studentName}</p>
          <p><strong className="font-semibold w-24 inline-block">Father:</strong> {fatherName}</p>
          <p><strong className="font-semibold w-24 inline-block">Phone:</strong> {fatherPhone || "N/A"}</p>
          <p><strong className="font-semibold w-24 inline-block">Adm No:</strong> {admissionNo}</p>
          <p><strong className="font-semibold w-24 inline-block">Branch:</strong> {branch}</p>
          <p><strong className="font-semibold w-24 inline-block">Class:</strong> {className}</p>
        </div>
        <div className="text-right">
          <p><strong className="font-semibold">Receipt No:</strong> {receiptNo}</p>
          <p><strong className="font-semibold">Date:</strong> {formatDate(paymentDate)}</p>
          <p><strong className="font-semibold">Mode:</strong> {paymentMode}</p>
        </div>
      </div>

      {/* Fee Details Table */}
      <table className="w-full text-sm text-left mb-8">
        <thead className="bg-gray-100 text-gray-700">
          <tr>
            <th className="px-4 py-2 font-semibold tracking-wider">SR. NO</th>
            <th className="px-4 py-2 font-semibold tracking-wider">FEE DETAILS</th>
            <th className="px-4 py-2 font-semibold tracking-wider text-right">AMOUNT</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item: any, index: number) => (
            <tr key={index} className="border-b">
              <td className="px-4 py-3">{index + 1}</td>
              <td className="px-4 py-3 font-medium">{item.title}</td>
              <td className="px-4 py-3 text-right font-mono">₹{item.payable.toLocaleString('en-IN')}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* Footer & Totals */}
      <div className="flex justify-between items-start">
        <div className="text-sm w-1/2">
          <p><strong className="font-semibold">Note:</strong> {paymentNote || "-"}</p>
        </div>
        <div className="w-1/2 text-sm">
          <div className="flex justify-between border-b pb-1 mb-1">
            <span className="text-gray-600">Total Amount:</span>
            <span className="font-mono text-right">₹{amount.toLocaleString('en-IN')}</span>
          </div>
          <div className="flex justify-between border-b pb-1 mb-1">
            <span className="text-gray-600">Concession:</span>
            <span className="font-mono text-right">- ₹{concession.toLocaleString('en-IN')}</span>
          </div>
          <div className="flex justify-between font-bold text-base border-b pb-1 mb-1">
            <span>Net Payable:</span>
            <span className="font-mono text-right">₹{payable.toLocaleString('en-IN')}</span>
          </div>
          <div className="flex justify-between font-bold text-base text-green-700 border-b pb-1 mb-1">
            <span>Paid Amount:</span>
            <span className="font-mono text-right">₹{data.paid.toLocaleString('en-IN')}</span>
          </div>
          <div className="flex justify-between font-bold text-base text-red-700">
            <span>Balance Due:</span>
            <span className="font-mono text-right">₹{data.due.toLocaleString('en-IN')}</span>
          </div>
        </div>
      </div>

      {/* Signature Section */}
      <div className="mt-12 flex justify-start">
        <div className="text-center">
          <p className="font-bold text-sm uppercase">ACCOUNTANT-MNG</p>
          <p className="text-sm mt-1 font-bold text-sm ">Auth. Signatory</p>
        </div>
      </div>

      <div className="text-center text-xs text-gray-400 mt-4">
        This is a computer-generated receipt.
      </div>
    </div>
  );
};

const FeeReceipt: React.FC<FeeReceiptProps> = ({ onClose, receiptData }) => {
  const handlePrint = () => {
    // We construct the HTML manually for printing 2 copies
    // Since we can't easily 'render' a React component to string with full styles in a browser-environment 
    // without server-side rendering or complex portals, we will assume 
    // we print what is visible, BUT user wants 2 copies.
    // 
    // Strategy: We will create a temporary hidden container, render the content twice there?
    // React doesn't support easy sync rendering to string in client.
    // 
    // ALTERNATIVE: Since we already control the window.document.write, we can just duplicate the HTML structure string.
    // BUT the 'printContent' is grabbed from receiptElement.innerHTML which is currently just 1 copy.
    // 
    // BEST APPROACH: Render 2 copies in the Modal but hide the second one with CSS? 
    // OR: Just modify the HTML string we grab.

    // Let's grab the HTML of the single receipt.
    const receiptElement = document.querySelector('.printable-receipt');
    if (!receiptElement) return;

    let content = receiptElement.innerHTML;

    // 1. Student Copy (Already rendered as Student Copy in the modal)
    const studentCopy = content;

    // 2. Office Copy (Replace 'Student Copy' text with 'Office Copy')
    const officeCopy = content.replace(/Student Copy/g, 'Office Copy');
    // Combined with a separator
    const combinedContent = `
          <div class="receipt-page">
              <div class="receipt-copy is-student">${studentCopy}</div>
              <div class="cut-line">----------------------------------------------------</div>
              <div class="receipt-copy is-office">${officeCopy}</div>
          </div>
      `;


    const stylesheets = Array.from(document.styleSheets)
      .map(sheet => {
        try {
          return Array.from(sheet.cssRules)
            .map(rule => rule.cssText)
            .join('');
        } catch (e) {
          console.warn('Could not read CSS rules from stylesheet:', sheet.href);
          return '';
        }
      })
      .join('\n');

    const googleFonts = document.querySelector('link[href^="https://fonts.googleapis.com"]')?.outerHTML || '';

    const printWindow = window.open('', '', 'height=800,width=800');
    if (!printWindow) {
      alert('Could not open print window.');
      return;
    }

    printWindow.document.write(`
          <!DOCTYPE html>
          <html>
          <head>
              <title>Fee Receipt</title>
              ${googleFonts}
              <style>
                  ${stylesheets}
                  @media print {
                    @page {
                      size: A4 portrait;
                      margin: 10mm;
                    }
                    body { 
                      margin: 0;
                      zoom: 70%;
                      -webkit-print-color-adjust: exact;
                    }
                    .no-print { display: none !important; }
                    .receipt-page { height: 100vh; }
                  }
                  body { 
                      font-family: 'Poppins', sans-serif; 
                      -webkit-print-color-adjust: exact; 
                  }
                  .receipt-container {
                      padding: 20px !important;
                      margin-bottom: 20px;
                  }
                  .cut-line {
                      text-align: center;
                      border-top: 1px dashed #ccc;
                      margin: 20px 0;
                      color: #999;
                      display: none; /* Hide text, use border */
                  }
                  .cut-line {
                      display: block;
                      border: 0;
                      border-top: 2px dashed #ccc;
                      height: 0;
                      margin: 20px 0;
                  }
                  @media print {
                    body { margin: 0; }
                    .no-print { display: none !important; }
                    .receipt-page { height: 100vh; }
                  }
              </style>
          </head>
          <body>
              ${combinedContent}
          </body>
          </html>
      `);

    printWindow.document.close();
    setTimeout(() => {
      printWindow.focus();
      printWindow.print();
      printWindow.close();
    }, 500);
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex justify-center items-center z-50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="printable-receipt">
          {/* We use the Template Component for the main display (Single Copy) */}
          <ReceiptTemplate data={receiptData} copyType="Student Copy" logo={ReceiptLogo} />
          {/* Note: The user sees 'Student Copy' on screen. When printing, we manipulate HTML to show both. */}
        </div>

        <div className="p-6 pt-0 flex justify-end space-x-4 no-print">
          <button onClick={onClose} className="px-6 py-2 text-sm font-semibold text-gray-700 bg-gray-100 border border-gray-300 rounded-md hover:bg-gray-200">Close</button>
          <button onClick={handlePrint} className="px-6 py-2 text-sm font-semibold text-white bg-violet-700 rounded-md hover:bg-violet-800">Print</button>
        </div>
      </div>
    </div>
  );
};

export default FeeReceipt;