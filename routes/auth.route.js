import express from "express";
import { promises as fs } from "fs";
import path from "path";
import { fileURLToPath } from "url";

import { api } from "../server.js";
import jwt from "jsonwebtoken";
import nodemailer from "nodemailer";

const router = express.Router();

// Get __dirname equivalent in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Register route
router.post("/register", async (req, res) => {
  try {
    const { email, password } = req.body;

    // Check if user already exists
    const { data: existingUsers } = await api.get("customers", {
      email,
      per_page: 1,
    });

    if (existingUsers.length > 0) {
      return res.status(400).json({ error: "Email already in use" });
    }

    // Create new customer
    const customerData = {
      email,
      password,
      username: email, // WooCommerce requires username
      role: "customer",
    };

    const { data: newCustomer } = await api.post("customers", customerData);

    // Generate JWT token
    const token = jwt.sign(
      { userId: newCustomer.id, email: newCustomer.email },
      process.env.JWT_SECRET,
      { expiresIn: "1h" }
    );

    const transporter = nodemailer.createTransport({
      host: "smtp.gmail.com",
      port: 465,
      secure: true,
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });

    const loginLink = `${process.env.FRONTEND_URL}/my-account`;

    const templatePath = path.join(
      __dirname,
      "../templates/register-confirmation.html"
    );
    let htmlTemplate = await fs.readFile(templatePath, "utf8");

    htmlTemplate = htmlTemplate
      .replace("{{email}}", newCustomer.email || "Customer")
      .replace("{{loginLink}}", loginLink);

    await transporter.sendMail({
      from: "Authentic Stone",
      to: email,
      subject: "Welcome to Authentic Stone – Your Account is Ready!",
      html: htmlTemplate,
      attachments: [
        {
          filename: "logo.png",
          path: path.join(
            __dirname,
            "../assets/Authentic-Stone-Logo-Black-400x33-1.png"
          ),
          cid: "logo",
        },
      ],
    });

    // Respond to client
    res.status(201).json({
      message: "Registration successful",
      customer: newCustomer,
      token,
    });
  } catch (error) {
    console.error("Registration error:", error);
    res.status(500).json({ error: "Registration failed" });
  }
});

// Login route
router.post("/login", async (req, res) => {
  // Set specific origin (not *) when using credentials
  res.header("Access-Control-Allow-Origin", "http://localhost:5173"); // frontend URL
  res.header("Access-Control-Allow-Origin", "https://9626d4be.authenticstone-frontend.pages.dev"); // frontend URL
  res.header("Access-Control-Allow-Credentials", "true");
  res.header("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.header("Access-Control-Allow-Headers", "Content-Type, Authorization");

  // Handle OPTIONS preflight
  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }
  try {
    const { email, password } = req.body;

    // Find user by email
    const { data: customers } = await api.get("customers", {
      email,
      per_page: 1,
    });

    if (customers.length === 0) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    const customer = customers[0];

    // In WooCommerce, passwords are hashed and stored in WordPress database
    // We need to authenticate against WordPress REST API
    const wpAuthResponse = await fetch(
      `${process.env.WC_SITE_URL}/wp-json/jwt-auth/v1/token`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          username: email,
          password,
        }),
      }
    );

    const authData = await wpAuthResponse.json();

    if (!wpAuthResponse.ok) {
      return res
        .status(401)
        .json({ error: authData.message || "Invalid credentials" });
    }

    // Generate our own JWT token for the React app
    const token = jwt.sign(
      { userId: customer.id, email: customer.email },
      process.env.JWT_SECRET,
      { expiresIn: "1h" }
    );

    res.json({
      message: "Login successful",
      customer,
      token,
      wpToken: authData.token, // WordPress JWT token if needed for future requests
    });
  } catch (error) {
    console.error("Login error:", error);
    res.status(500).json({ error: "Login failed" });
  }
});

// Update Fields
router.put("/update-profile", async (req, res) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader) {
      return res.status(401).json({ error: "Missing Authorization header" });
    }

    const token = authHeader.split(" ")[1];

    // Verify token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const customerId = decoded.userId;

    const { first_name, last_name, password, billing, shipping } = req.body;

    // Build the update payload dynamically
    const updateData = {};

    if (first_name) updateData.first_name = first_name;
    if (last_name) updateData.last_name = last_name;
    if (password) updateData.password = password;
    if (billing) updateData.billing = billing;
    if (shipping) updateData.shipping = shipping;

    const { data: updatedCustomer } = await api.put(
      `customers/${customerId}`,
      updateData
    );

    res.json({
      message: "Profile updated successfully",
      customer: updatedCustomer,
    });
  } catch (error) {
    console.error("Update profile error:", error);

    if (
      error.name === "JsonWebTokenError" ||
      error.name === "TokenExpiredError"
    ) {
      return res.status(401).json({ error: "Invalid or expired token" });
    }

    res.status(500).json({ error: "Profile update failed" });
  }
});

/* Password Reset Flow */
router.post("/lost-password", async (req, res) => {
  const { email } = req.body;

  const wcResponse = await fetch(
    `${process.env.WC_SITE_URL}/wp-json/wc/v3/customers?email=${email}`,
    {
      headers: {
        Authorization:
          "Basic " +
          Buffer.from(
            process.env.WC_CONSUMER_KEY + ":" + process.env.WC_CONSUMER_SECRET
          ).toString("base64"),
      },
    }
  );

  const users = await wcResponse.json();
  if (!users || users.length === 0) {
    return res.status(404).json({ message: "Email not found" });
  }

  const user = users[0];

  // 2️⃣ Generate reset token
  const token = jwt.sign({ userId: user.id, email }, process.env.JWT_SECRET, {
    expiresIn: "15m",
  });

  const transporter = nodemailer.createTransport({
    host: "smtp.gmail.com",
    port: 465,
    secure: true,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });

  const resetLink = `${process.env.FRONTEND_URL}/my-account/lost-password/?show-reset-form=true&action=resetpwd&token=${token}`;
  /* const resetLink = `${process.env.WC_SITE_URL}?token=${token}`; */

  // Read and process email template
  try {
    const templatePath = path.join(
      __dirname,
      "../templates/password-reset.html"
    );
    let htmlTemplate = await fs.readFile(templatePath, "utf8");

    // Replace placeholders with actual values
    htmlTemplate = htmlTemplate
      .replace("{{firstName}}", user.first_name || "Customer")
      .replace("{{resetLink}}", resetLink)
      .replace("{{expiryTime}}", "15 minutes");

    await transporter.sendMail({
      from: "Authentic Stone",
      to: email,
      subject: "Password Reset Request for Authentic Stone",
      html: htmlTemplate,
      attachments: [
        {
          filename: "logo.png",
          path: path.join(
            __dirname,
            "../assets/Authentic-Stone-Logo-Black-400x33-1.png"
          ),
          cid: "logo",
        },
      ],
    });

    res.json({ message: "Password reset email sent" });
  } catch (error) {
    console.error("Error sending email:", error);
    res.status(500).json({ message: "Failed to send password reset email" });
  }
});

/* Verify Reset Token */
router.post("/verify-reset-token", async (req, res) => {
  const { token } = req.body;

  if (!token) {
    return res.status(400).json({ message: "Token is required", valid: false });
  }

  try {
    // Verify the JWT token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // Check if user still exists in WooCommerce
    const wcResponse = await fetch(
      `${process.env.WC_SITE_URL}/wp-json/wc/v3/customers/${decoded.userId}`,
      {
        headers: {
          Authorization:
            "Basic " +
            Buffer.from(
              process.env.WC_CONSUMER_KEY + ":" + process.env.WC_CONSUMER_SECRET
            ).toString("base64"),
        },
      }
    );

    if (!wcResponse.ok) {
      return res.status(404).json({ message: "User not found", valid: false });
    }

    res.json({
      message: "Token is valid",
      valid: true,
      userId: decoded.userId,
      email: decoded.email,
    });
  } catch (error) {
    if (error.name === "TokenExpiredError") {
      return res
        .status(401)
        .json({ message: "Token has expired", valid: false });
    }
    if (error.name === "JsonWebTokenError") {
      return res.status(401).json({ message: "Invalid token", valid: false });
    }
    console.error("Token verification error:", error);
    res
      .status(500)
      .json({ message: "Token verification failed", valid: false });
  }
});

/* Password Reset api endpoint */
router.post("/reset-password", async (req, res) => {
  const { token, newPassword } = req.body;

  if (!token || !newPassword) {
    return res
      .status(400)
      .json({ message: "Token and new password are required" });
  }

  if (newPassword.length < 6) {
    return res
      .status(400)
      .json({ message: "Password must be at least 6 characters long" });
  }

  try {
    // Verify the JWT token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // Update password in WooCommerce
    const updateResponse = await fetch(
      `${process.env.WC_SITE_URL}/wp-json/wc/v3/customers/${decoded.userId}`,
      {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization:
            "Basic " +
            Buffer.from(
              process.env.WC_CONSUMER_KEY + ":" + process.env.WC_CONSUMER_SECRET
            ).toString("base64"),
        },
        body: JSON.stringify({
          password: newPassword,
        }),
      }
    );

    if (!updateResponse.ok) {
      const errorData = await updateResponse.json();
      console.error("WooCommerce update error:", errorData);
      return res.status(400).json({ message: "Failed to update password" });
    }

    const updatedUser = await updateResponse.json();

    const transporter = nodemailer.createTransport({
      host: "smtp.gmail.com",
      port: 465,
      secure: true,
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });

    // Optional: Send confirmation email
    try {
      const templatePath = path.join(
        __dirname,
        "../templates/password-reset-confirmation.html"
      );
      let htmlTemplate = await fs.readFile(templatePath, "utf8");

      htmlTemplate = htmlTemplate.replace(
        "{{firstName}}",
        updatedUser.first_name || "Customer"
      );

      await transporter.sendMail({
        from: "Authentic Stone",
        to: decoded.email,
        subject: "Password Reset Successful - Authentic Stone",
        html: htmlTemplate,
        attachments: [
          {
            filename: "logo.png",
            path: path.join(
              __dirname,
              "../assets/Authentic-Stone-Logo-Black-400x33-1.png"
            ),
            cid: "logo",
          },
        ],
      });
    } catch (emailError) {
      console.error("Error sending confirmation email:", emailError);
      // Don't fail the request if email fails
    }

    res.json({
      message: "Password reset successful",
      success: true,
    });
  } catch (error) {
    if (error.name === "TokenExpiredError") {
      return res.status(401).json({ message: "Reset link has expired" });
    }
    if (error.name === "JsonWebTokenError") {
      return res.status(401).json({ message: "Invalid reset link" });
    }
    console.error("Password reset error:", error);
    res.status(500).json({ message: "Password reset failed" });
  }
});

// Delete customer route
router.delete("/customer/:id", async (req, res) => {
  try {
    const { id } = req.params;

    // Optional: Verify JWT token and check if user has permission to delete
    const token = req.headers.authorization?.replace("Bearer ", "");
    if (!token) {
      return res.status(401).json({ error: "Access token required" });
    }

    let decoded;
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET);
    } catch (jwtError) {
      return res.status(401).json({ error: "Invalid token" });
    }

    // Check if user is trying to delete their own account or has admin privileges
    if (decoded.userId !== parseInt(id)) {
      // You might want to add admin role check here
      return res
        .status(403)
        .json({ error: "Unauthorized to delete this customer" });
    }

    // First, get customer details before deletion (for email notification)
    const { data: customer } = await api.get(`customers/${id}`);

    if (!customer) {
      return res.status(404).json({ error: "Customer not found" });
    }

    // Delete the customer from WooCommerce
    await api.delete(`customers/${id}`, {
      force: true, // Permanently delete instead of moving to trash
    });

    // Optional: Send deletion confirmation email
    const transporter = nodemailer.createTransport({
      host: "smtp.gmail.com",
      port: 465,
      secure: true,
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });

    const templatePath = path.join(
      __dirname,
      "../templates/delete-account-temp.html"
    );

    const homeLink = `${process.env.FRONTEND_URL}`;

    // Check if template exists, if not send simple text email
    let emailContent;
    try {
      let htmlTemplate = await fs.readFile(templatePath, "utf8");

      emailContent = htmlTemplate
        .replace("{{email}}", customer.email || "Customer")
        .replace("{{customerName}}", customer.first_name || customer.email)
        .replace("{{homeLink}}", homeLink);
    } catch (templateError) {
      // Fallback to simple HTML if template doesn't exist
      emailContent = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2>Account Deletion Confirmation</h2>
          <p>Dear ${customer.first_name || customer.email},</p>
          <p>This email confirms that your Authentic Stone account has been successfully deleted.</p>
          <p>If you did not request this deletion, please contact our support team immediately.</p>
          <p>Thank you for being part of Authentic Stone.</p>
          <br>
          <p>Best regards,<br>The Authentic Stone Team</p>
        </div>
      `;
    }

    await transporter.sendMail({
      from: "Authentic Stone",
      to: customer.email,
      subject: "Account Deletion Confirmation - Authentic Stone",
      html: emailContent,
      attachments: [
        {
          filename: "logo.png",
          path: path.join(
            __dirname,
            "../assets/Authentic-Stone-Logo-Black-400x33-1.png"
          ),
          cid: "logo",
        },
      ],
    });

    // Respond to client
    res.status(200).json({
      message: "Customer deleted successfully",
      deletedCustomer: {
        id: customer.id,
        email: customer.email,
      },
    });
  } catch (error) {
    console.error("Customer deletion error:", error);

    // Handle specific WooCommerce API errors
    if (error.response?.status === 404) {
      return res.status(404).json({ error: "Customer not found" });
    }

    res.status(500).json({ error: "Customer deletion failed" });
  }
});

// Alternative route for self-deletion (if you want users to delete their own accounts)
router.delete("/account/delete", async (req, res) => {
  try {
    // Verify JWT token
    const token = req.headers.authorization?.replace("Bearer ", "");
    if (!token) {
      return res.status(401).json({ error: "Access token required" });
    }

    let decoded;
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET);
    } catch (jwtError) {
      return res.status(401).json({ error: "Invalid token" });
    }

    const customerId = decoded.userId;

    // Get customer details before deletion
    const { data: customer } = await api.get(`customers/${customerId}`);

    if (!customer) {
      return res.status(404).json({ error: "Customer not found" });
    }

    // Delete the customer
    await api.delete(`customers/${customerId}`, {
      force: true,
    });

    // Send confirmation email (same as above)
    const transporter = nodemailer.createTransport({
      host: "smtp.gmail.com",
      port: 465,
      secure: true,
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });

    const templatePath = path.join(
      __dirname,
      "../templates/delete-account-temp.html"
    );

    const homeLink = `${process.env.FRONTEND_URL}`;

    // Check if template exists, if not send simple text email
    let emailContent;
    try {
      let htmlTemplate = await fs.readFile(templatePath, "utf8");

      emailContent = htmlTemplate
        .replace("{{email}}", customer.email || "Customer")
        .replace("{{customerName}}", customer.first_name || customer.email)
        .replace("{{homeLink}}", homeLink);
    } catch (templateError) {
      // Fallback to simple HTML if template doesn't exist
      emailContent = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2>Account Deletion Confirmation</h2>
          <p>Dear ${customer.first_name || customer.email},</p>
          <p>This email confirms that your Authentic Stone account has been successfully deleted.</p>
          <p>If you did not request this deletion, please contact our support team immediately.</p>
          <p>Thank you for being part of Authentic Stone.</p>
          <br>
          <p>Best regards,<br>The Authentic Stone Team</p>
        </div>
      `;
    }

    res.status(200).json({
      message: "Your account has been deleted successfully",
    });
  } catch (error) {
    console.error("Account deletion error:", error);
    res.status(500).json({ error: "Account deletion failed" });
  }
});

export default router;
