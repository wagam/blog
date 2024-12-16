// @ts-check
import { defineConfig } from 'astro/config';
import mdx from '@astrojs/mdx';

import sitemap from '@astrojs/sitemap';

import react from '@astrojs/react';

import icon from 'astro-icon';


import vercel from '@astrojs/vercel';


// https://astro.build/config
export default defineConfig({
  site: 'https://blog-marcobus.vercel.app',
  integrations: [mdx(), sitemap(), react(), icon()],
  adapter: vercel(),
  output: 'server',
});
