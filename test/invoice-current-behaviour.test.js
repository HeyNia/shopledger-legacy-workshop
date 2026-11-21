var test = require('node:test');
var assert = require('node:assert/strict');
var pricing = require('../lib/pricing');
var invoice = require('../lib/invoice');
var reports = require('../lib/reports');

test('invoice figures match the order pricing totals and item GST breakdown', function () {
  var items = [
    { id: 1, name: 'Rice', hsn: '1006', price: 2000, qty: 1 },
    { id: 2, name: 'Ghee', hsn: '0405', price: 500, qty: 1 }
  ];
  var priced = pricing.computeTotals(items, 'SAVE10');
  var invoiced = invoice.computeInvoiceFigures({ items: items, coupon: 'SAVE10' });

  assert.equal(invoiced.subtotal, priced.subtotal);
  assert.equal(invoiced.discount, priced.discount);
  assert.equal(invoiced.tax, priced.tax);
  assert.equal(invoiced.cgst, priced.cgst);
  assert.equal(invoiced.sgst, priced.sgst);
  assert.equal(invoiced.total, priced.total);
  assert.deepEqual(invoiced.rows.map(function (row) { return row.lineTax; }),
    priced.lines.map(function (line) { return line.tax; }));
});

test('invoice and order pricing use the same HSN slab', function () {
  var items = [{ id: 1, name: 'Rice', hsn: '1006', price: 100, qty: 1 }];
  var ledger = pricing.computeTotals(items, '');
  var printedInvoice = invoice.computeInvoiceFigures({ items: items });

  assert.equal(ledger.tax, 5);
  assert.equal(ledger.total, 105);
  assert.equal(printedInvoice.tax, 5);
  assert.equal(printedInvoice.total, 105);
});

test('invoice uses the capped coupon discount and discounted taxable value', function () {
  var items = [{ name: 'Staples', hsn: '1006', price: 2000, qty: 1 }];
  var ledger = pricing.computeTotals(items, 'SAVE10');
  var printedInvoice = invoice.computeInvoiceFigures({ items: items, coupon: 'SAVE10' });

  assert.equal(ledger.discount, 150);
  assert.equal(ledger.tax, 92.5);
  assert.equal(ledger.total, 1942.5);
  assert.equal(printedInvoice.discount, 150);
  assert.equal(printedInvoice.tax, 92.5);
  assert.equal(printedInvoice.total, 1942.5);
});

test('invoice resolves a decimal order-line gstRate consistently', function () {
  var items = [{ name: 'Tea', price: 100, qty: 1, gstRate: 0.05 }];

  assert.equal(pricing.computeTotals(items, '').tax, 5);
  assert.equal(invoice.computeInvoiceFigures({ items: items }).tax, 5);
  assert.equal(invoice.computeInvoiceFigures({ items: items }).rows[0].gstPercent, 5);
});

test('reconciliation matches stored order figures when invoice inputs match pricing', function () {
  var db = {
    orders: [{
      id: 7,
      date: '21/11/2026',
      customer: 'A Customer',
      items: [{ name: 'Rice', hsn: '1006', price: 100, qty: 1 }],
      subtotal: 100,
      discount: 0,
      tax: 5,
      total: 105
    }]
  };

  var result = reports.getGstReconciliation(db);
  assert.equal(result.totalChecked, 1);
  assert.equal(result.mismatchCount, 0);
  assert.equal(result.totalDelta, 0);
  assert.deepEqual(result.rows[0], {
    orderId: 7,
    date: '21/11/2026',
    customer: 'A Customer',
    coupon: '',
    ledgerSubtotal: 100,
    ledgerDiscount: 0,
    ledgerTax: 5,
    ledgerTotal: 105,
    invoiceDiscount: 0,
    invoiceTax: 5,
    invoiceTotal: 105,
    delta: 0,
    matched: true
  });
});

test('rendered invoice shows the billed amount without a mismatch notice', function () {
  var html = invoice.render({
    id: 7,
    date: '21/11/2026',
    total: 105,
    items: [{ name: 'Rice', hsn: '1006', price: 100, qty: 1 }]
  });

  assert.match(html, /Invoice Total<\/td><td class="r">₹105\.00/);
  assert.doesNotMatch(html, /Invoice computed total/);
});
