import express from "express";
import jwt from "jsonwebtoken";

const router = express.Router();

router.post("/refresh", (req, res) => {
  const refreshToken = req.cookies.refreshToken; // read from cookie
  if (!refreshToken) return res.status(401).json({ message: "Refresh token required" });

  jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET, (err, decoded) => {
    if (err) return res.status(403).json({ message: "Invalid or expired refresh token" });

    const newAccessToken = jwt.sign(
      { id: decoded.id },
      process.env.JWT_SECRET,
      { expiresIn: "15m" }
    );

    res.json({ token: newAccessToken });
  });
});

export default router;