import path from 'path';
import TerserPlugin from 'terser-webpack-plugin';
import { defineConfig } from 'umi';
import routes from './src/routes';

export default defineConfig({
  title: 'SGAI Legal | Assistente AI per Diritto Tributario Italiano',
  outputPath: 'dist',
  metas: [
    {
      name: 'description',
      content:
        "SGAI è l'assistente legale AI specializzato in diritto tributario italiano. Analisi giurisprudenziale istantanea con 50.000+ sentenze, consulenza fiscale automatizzata.",
    },
    {
      name: 'keywords',
      content:
        'assistente legale AI, diritto tributario, consulenza fiscale Italia, intelligenza artificiale legale, avvocato tributarista online',
    },
  ],
  alias: { '@parent': path.resolve(__dirname, '../') },
  npmClient: 'npm',
  base: '/',
  routes,
  publicPath: '/',
  esbuildMinifyIIFE: true,
  icons: {},
  hash: true,
  favicons: ['/logo.svg'],
  clickToComponent: {},
  history: {
    type: 'browser',
  },
  plugins: [
    '@react-dev-inspector/umi4-plugin',
    '@umijs/plugins/dist/tailwindcss',
  ],
  jsMinifier: 'none', // Fixed the issue that the page displayed an error after packaging lexical with terser
  lessLoader: {
    modifyVars: {
      hack: `true; @import "~@/less/index.less";`,
    },
  },
  devtool: 'source-map',
  copy: [
    { from: 'src/conf.json', to: 'dist/conf.json' },
    { from: 'node_modules/monaco-editor/min/vs/', to: 'dist/vs/' },
    { from: 'public/sitemap.xml', to: 'dist/sitemap.xml' },
    { from: 'public/robots.txt', to: 'dist/robots.txt' },
    { from: 'public/site.webmanifest', to: 'dist/site.webmanifest' },
  ],
  proxy: [
    {
      context: ['/api', '/v1'],
      target: 'http://127.0.0.1:9380/',
      changeOrigin: true,
      ws: true,
      logger: console,
      // pathRewrite: { '^/v1': '/v1' },
    },
  ],

  chainWebpack(memo, args) {
    memo.module.rule('markdown').test(/\.md$/).type('asset/source');

    memo.optimization.minimizer('terser').use(TerserPlugin); // Fixed the issue that the page displayed an error after packaging lexical with terser

    return memo;
  },
  tailwindcss: {},
});
