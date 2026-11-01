// Imported first by every test: tests write and delete rows, so they run only against the test database (aqar_test).
const url = process.env.DATABASE_URL ?? "";
if (!/\/aqar_test(\?|$)/.test(url)) {
  console.error("Refusing to run: tests must use the test database (DATABASE_URL …/aqar_test). Use npm run test:… (it loads .env.test.local).");
  process.exit(2);
}
