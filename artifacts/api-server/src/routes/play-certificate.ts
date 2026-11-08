import { Router, type IRouter } from "express";

const router: IRouter = Router();

// Public X.509 certificate only. Never serve a private key or keystore here.
const certificate = `-----BEGIN CERTIFICATE-----
MIIDKjCCAhKgAwIBAgIJANR7WwklnDg+MA0GCSqGSIb3DQEBCwUAMEIxCTAHBgNV
BAYTADEJMAcGA1UECBMAMQkwBwYDVQQHEwAxCTAHBgNVBAoTADEJMAcGA1UECxMA
MQkwBwYDVQQDEwAwIBcNMjYwNzA3MDYxNDUwWhgPMjA1MzExMjIwNjE0NTBaMEIx
CTAHBgNVBAYTADEJMAcGA1UECBMAMQkwBwYDVQQHEwAxCTAHBgNVBAoTADEJMAcG
A1UECxMAMQkwBwYDVQQDEwAwggEiMA0GCSqGSIb3DQEBAQUAA4IBDwAwggEKAoIB
AQCw/DPYPnAdTDgXKkxzRSv9hUMbSEY/KZJEUDr+7Hkpe2/ZOMMg2X4BGhsEw9Ks
04xzdWBTd94xTAroL91WCQZB3Ln463yHC7Z+mODkc0VYKeEERAaC2K7Vouf9M7eK
BmzBS7FHONzvj9z7T9eprwc/lma14WxDzzB4BZxyEmLY6HCu8VnEi1rbZgXTTSiD
zScwEa+SmR5/0Zc9QXWl+k1b+ESQeJtux2ZV6KQyHFmzNb5NIAbnF/kq5w45obOG
ju0AgEXXSx7xhQekG/0/8xZw9x56VqvuBq2xt7e/HN7heEeFKbONY4UHhISO2Kbn
CPoYLGFCw6p+41L3d7ocngKLAgMBAAGjITAfMB0GA1UdDgQWBBSK1ECdPm4c532m
6LPq0Y2cmZNDZDANBgkqhkiG9w0BAQsFAAOCAQEApQX6xt7B8yTEgqVBJX9hN8qj
QETnuEu+jFpBmunRDqJk3TfgnC2sN7R3vUXqa1NGHXR13ng+7UKaXG+vr2AlJ+Iy
acM62M42oDlLSETT5xpyjqIYk3FzvoiixulxmcLgg5Op5vb9uoH6rSSNjavrgGLu
ouBHECCoFO6V+7pYmhQCNRVrGTI3sNAH4NkwS4BA6AKJp4NGobQ+3+7NzZPMa5c3
EHYvX3eo/iWmX5J6I7S5QEfLCXyI7dQJnSu8MPbFRZYMDAGy7HEtheaA1Ta3s9xU
AEr7SYY6DlCGLtOZSiq/3w6OMqQywzkI73ROpquZQDnpOBYwUp/AKYUuCy1rAA==
-----END CERTIFICATE-----
`;

router.get("/play-upload-certificate.pem", (_req, res) => {
  res.set({
    "Content-Type": "application/octet-stream",
    "Content-Disposition": 'attachment; filename="upload_certificate.pem"',
    "X-Content-Type-Options": "nosniff",
    "Cache-Control": "no-store",
  });
  res.send(Buffer.from(certificate, "utf8"));
});

export default router;