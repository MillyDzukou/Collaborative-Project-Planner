import express from "express";
import cors from "cors";
import { config } from "./config.js";

const app = express();

app.use(cors({ origin: config.webOrigin, credentials: true }));
app.use(express.json());

app.get("/health", (_req, res) => {
  res.status(200).json({ status: "ok" });
});

app.listen(config.port, () => {
  console.log(`api listening on :${config.port}`);
});
