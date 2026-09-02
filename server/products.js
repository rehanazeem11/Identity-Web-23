/**
 * One-time seed data for the site's 4 default products — see
 * services/seedProducts.js, which inserts these into MongoDB the first
 * time the products collection is empty.
 *
 * This file is NOT consulted at checkout anymore. routes/orders.js now
 * validates every item's price against the live Product collection in
 * MongoDB (models/Product.js), so admin-edited prices for these same 4
 * products actually take effect. Editing the numbers here only changes
 * what a brand-new, never-seeded database starts with — it won't touch
 * prices already in Mongo. To change a live price, edit it in the admin
 * panel (or the Product collection directly), not here.
 */
module.exports = [
    { id: 'p1', title: 'The Knife Mirror®', numericPrice: 32500 },
    { id: 'p2', title: 'Mug Coffee Table', numericPrice: 18500 },
    { id: 'p3', title: 'The Antler Accent', numericPrice: 29999 },
    { id: 'p4', title: 'The Wave Chair', numericPrice: 24999 }
];
