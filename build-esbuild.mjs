#!/usr/bin/env node
/**
 * Build script: Bundle index.html with Firebase using esbuild
 * Generates bundle that works locally without CORS issues
 */

import * as esbuild from 'esbuild';
import fs from 'fs';
import path from 'path';

const result = await esbuild.build({
  entryPoints: ['tache-enfant/index.html'],
  bundle: true,
  outdir: '.build',
  loader: {
    '.html': 'text',
    '.css': 'text'
  },
  external: [],
  platform: 'browser',
  format: 'esm',
  target: 'es2020'
});

console.log('✅ esbuild completed');
console.log('   Output: .build/');
