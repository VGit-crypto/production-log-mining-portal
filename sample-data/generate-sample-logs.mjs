// Generates sample-data/sample-logs.ndjson and sample-logs.json for trying the portal.
// Usage: node sample-data/generate-sample-logs.mjs
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = dirname(fileURLToPath(import.meta.url));
const rnd = (n) => Math.floor(Math.random() * n);
const uuid = () => crypto.randomUUID();
const day = (d) => new Date(Date.now() - d * 86400000 - rnd(80000000)).toISOString();

const templates = [
  { w: 120, level: 'ERROR', module: 'payment-service', exceptionType: 'java.sql.SQLTransientConnectionException', message: () => `Connection pool exhausted after ${20000 + rnd(500)}ms waiting for order ${uuid()}`, stack: 'at com.zaxxer.hikari.pool.HikariPool.getConnection(HikariPool.java:186)\nat com.shop.payment.PaymentRepository.save(PaymentRepository.java:54)' },
  { w: 60, level: 'ERROR', module: 'auth-service', exceptionType: 'TokenExpiredError', message: () => `JWT token expired for user user${rnd(900)}@example.com` },
  { w: 35, level: 'ERROR', module: 'order-service', exceptionType: 'TypeError', message: () => `Cannot read properties of undefined (reading 'items') for cart ${rnd(99999)}`, stack: 'at OrderController.checkout (order.controller.js:88:21)' },
  { w: 12, level: 'FATAL', module: 'inventory-service', exceptionType: 'java.lang.OutOfMemoryError', message: () => 'Java heap space while loading catalog snapshot', stack: 'at com.shop.inventory.CatalogLoader.load(CatalogLoader.java:120)' },
  { w: 28, level: 'ERROR', module: 'gateway', message: () => `Upstream request to http://10.0.${rnd(255)}.${rnd(255)}/pricing timed out after 30000ms` },
  { w: 8, level: 'WARN', module: 'notification-service', exceptionType: 'ValidationException', message: () => `Invalid email format "bad${rnd(99)}@@mail"` },
  { w: 4, level: 'INFO', module: 'gateway', message: () => 'Health check OK' },
];
const pool = templates.flatMap((t) => Array(t.w).fill(t));
const infoNoise = Array.from({ length: 400 }, () => ({ level: 'INFO', module: ['gateway', 'order-service', 'payment-service'][rnd(3)], message: `Request ${uuid()} completed in ${rnd(300)}ms` }));

const records = [...pool.map((t) => ({ timestamp: day(rnd(14)), level: t.level, module: t.module, message: t.message(), exceptionType: t.exceptionType, stackTrace: t.stack, correlationId: uuid() })), ...infoNoise.map((n) => ({ timestamp: day(rnd(14)), ...n }))].sort((a, b) => a.timestamp.localeCompare(b.timestamp));

writeFileSync(join(dir, 'sample-logs.ndjson'), records.map((r) => JSON.stringify(r)).join('\n') + '\n');
writeFileSync(join(dir, 'sample-logs.json'), JSON.stringify({ logs: records }, null, 2));
console.log(`Wrote ${records.length} records.`);
