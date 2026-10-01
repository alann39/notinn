"use client";

import React from "react";
import { AuthBackground } from "@/components/ui/auth-background";
import { EncryptedText } from "@/components/ui/encrypted-text";
import { LoginOnboardingDialog } from "@/components/ui/login-onboarding-dialog";

export function ModernLogin(): React.ReactElement {
  return (
    <div
      style={{
        position: "relative",
        width: "100%",
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        overflow: "hidden",
        background: "#000",
        color: "#fff",
        fontFamily: "'Inter', -apple-system, sans-serif",
        padding: "2rem 1rem",
      }}
    >
      <AuthBackground />

      {/* Cardless welcome content */}
      <div
        style={{
          position: "relative",
          zIndex: 2,
          width: "100%",
          maxWidth: 640,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          textAlign: "center",
          padding: "1rem",
        }}
      >
        <h1
          style={{
            fontFamily: "'Inter', 'Helvetica Neue', Arial, sans-serif",
            fontSize: "clamp(2.75rem, 8vw, 5.5rem)",
            fontWeight: 600,
            letterSpacing: "-0.08em",
            lineHeight: 1,
            marginBottom: "2rem",
            color: "#fff",
            textShadow:
              "0 4px 30px rgba(0, 0, 0, 0.7), 0 2px 10px rgba(0, 0, 0, 0.4)",
          }}
        >
          <EncryptedText
            text="Sign in to Notinn"
            revealDelayMs={60}
            encryptedClassName="text-neutral-500"
            revealedClassName="text-white"
          />
        </h1>

        <div>
          <LoginOnboardingDialog />
        </div>
      </div>

      {/* Back to home at bottom of screen */}
      <a
        href="/"
        style={{
          position: "absolute",
          bottom: "max(1.5rem, env(safe-area-inset-bottom))",
          left: "50%",
          transform: "translateX(-50%)",
          zIndex: 2,
          color: "rgba(255, 255, 255, 0.45)",
          fontSize: "0.8125rem",
          fontWeight: 500,
          letterSpacing: "-0.01em",
          textDecoration: "none",
          transition: "color 0.15s ease",
          whiteSpace: "nowrap",
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.color = "rgba(255, 255, 255, 0.9)";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.color = "rgba(255, 255, 255, 0.45)";
        }}
      >
        Back to home
      </a>
    </div>
  );
}

export default ModernLogin;
