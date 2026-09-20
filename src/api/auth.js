// Protege /restart, /qr y /export-contacts. El token vive en una variable de entorno
// distinta por tenant (config.restartTokenEnvVar), nunca hardcodeado.
export function requireToken(restartTokenEnvVar) {
  return (req, res, next) => {
    const expected = process.env[restartTokenEnvVar];
    if (!expected) {
      return res.status(500).json({ error: `Falta configurar ${restartTokenEnvVar} en el entorno` });
    }

    const header = req.headers.authorization || "";
    const token = header.startsWith("Bearer ") ? header.slice("Bearer ".length) : null;

    if (token !== expected) {
      return res.status(401).json({ error: "unauthorized" });
    }

    next();
  };
}
