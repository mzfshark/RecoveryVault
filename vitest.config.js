// vitest.config.js
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['**/*.test.{js,jsx,ts,tsx}'],
    exclude: [
      'test/integration/**',
      'test/integraation/**',
      'hardhat.config.*',
      'scripts/**',
      'node_modules/**',
    ],
    environment: 'node',
    passWithNoTests: false,
  },
});
