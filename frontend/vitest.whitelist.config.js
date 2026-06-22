import { defineConfig } from 'vitest/config';
import viteConfig from './vite.config';
import whitelistData from './vitest.whitelist.json';

export default {
  ...viteConfig,
  test: {
    ...viteConfig.test,
    include: whitelistData.whitelist,
  }
};
