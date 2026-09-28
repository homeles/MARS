import mongoose from 'mongoose';
import { afterAll, afterEach, beforeAll } from 'vitest';

/**
 * Tests run against a real MongoDB instance.
 *
 * Set MONGODB_TEST_URI to point at one. Locally, the quickest way is:
 *
 *   docker run -d --name mars-test-mongo -p 27018:27017 mongo:7
 *   MONGODB_TEST_URI=mongodb://localhost:27018 npm test
 *
 * CI starts an equivalent service container (see .github/workflows/ci.yml).
 *
 * We deliberately do NOT use mongodb-memory-server: it downloads a mongod
 * binary at run time, which fails on hosts without AVX (mongod 5.0+ aborts
 * with SIGILL) or without OpenSSL 1.1 (mongod 4.x cannot resolve
 * libcrypto.so.1.1). A plain container works everywhere Docker does.
 */
const uri = process.env.MONGODB_TEST_URI ?? 'mongodb://localhost:27018';

// Give every worker its own database so parallel runs cannot collide.
const dbName = `mars_test_${process.pid}`;

beforeAll(async () => {
  await mongoose.connect(uri, { dbName, serverSelectionTimeoutMS: 10_000 });
});

afterEach(async () => {
  // Drop data between tests so characterization cases stay independent.
  const { collections } = mongoose.connection;
  for (const key of Object.keys(collections)) {
    await collections[key].deleteMany({});
  }
});

afterAll(async () => {
  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
});
