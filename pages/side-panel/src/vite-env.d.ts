/// <reference types="vite/client" />

// Chrome Extension Boilerplate (CEB) Environment Variables
// These are available via process.env.CEB_* in the build
declare namespace NodeJS {
  interface ProcessEnv {
    readonly CEB_API_URL?: string;
    readonly CEB_BACKEND_URL?: string;
    readonly CEB_DEV_LOCALE?: string;
    readonly CEB_CI?: string;
    readonly CEB_NODE_ENV?: 'development' | 'production';
  }
}

