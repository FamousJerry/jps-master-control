"use strict";
const path = require("path");
const express = require("express");
const compression = require("compression");
const helmet = require("helmet");

const app = express();
const PORT = process.env.PORT || 8080;
const DIST = path.join(__dirname, "web", "dist");

app.set("trust proxy", 1);
app.use(
  helmet({
    contentSecurityPolicy: {
      useDefaults: true,
      directives: {
        "script-src": ["'self'", "'unsafe-inline'", "https:"],
        "style-src": ["'self'", "'unsafe-inline'", "https:"],
        "img-src": ["'self'", "data:", "https:"],
        "connect-src": ["'self'", "https:"],
      },
    },
    crossOriginEmbedderPolicy: false,
  })
);
if (process.env.NODE_ENV === "production") {
  app.use(helmet.hsts({ maxAge: 60 * 60 * 24 * 30, includeSubDomains: true }));
}
app.use(compression());
app.use(
  express.static(DIST, {
    etag: true,
    lastModified: true,
    setHeaders: (res, fp) => {
      if (/\.(?:js|css|svg|png|jpg|jpeg|gif|webp|ico|woff2?)$/i.test(fp)) {
        res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
      } else {
        res.setHeader("Cache-Control", "no-store");
      }
    },
  })
);
app.get("/healthz", (_req, res) => res.status(200).send("ok"));
app.get("/readyz", (_req, res) => res.status(200).send("ready"));
app.get("*", (_req, res) => res.sendFile(path.join(DIST, "index.html")));
app.listen(PORT, () => console.log(`Web listening on ${PORT}`));
