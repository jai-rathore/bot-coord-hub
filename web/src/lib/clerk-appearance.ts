import type { ComponentProps } from "react";
import type { ClerkProvider } from "@clerk/nextjs";

type ClerkProviderProps = ComponentProps<typeof ClerkProvider>;

/** Shared Clerk UI branding for HoneyMatcha (embedded SignIn / SignUp / UserButton). */
export const clerkAppearance = {
  variables: {
    colorPrimary: "#173f2e",
    colorBackground: "#fffffc",
    colorForeground: "#17211c",
    colorMutedForeground: "#5c6a62",
    colorMuted: "#e7eee8",
    colorBorder: "#d9e2da",
    colorInput: "#ffffff",
    colorInputForeground: "#17211c",
    colorNeutral: "#17211c",
    colorRing: "#286445",
    colorShadow: "#173f2e",
    colorPrimaryForeground: "#fbfdf9",
    fontFamily: "var(--font-sora), 'Segoe UI', sans-serif",
    fontFamilyButtons: "var(--font-sora), 'Segoe UI', sans-serif",
    borderRadius: "0.8rem",
    spacing: "0.95rem",
  },
  options: {
    // Absolute production URL so Clerk’s hosted assets resolve the mark
    // (not the default Next/Vercel favicon). Asset is also at /logo-mark.png.
    logoImageUrl: "https://honeymatcha.io/logo-mark.png",
    logoLinkUrl: "/",
    logoPlacement: "inside" as const,
    socialButtonsPlacement: "top" as const,
    socialButtonsVariant: "blockButton" as const,
    showOptionalFields: false,
    // Hides the in-component "Development mode" notice when previewing with pk_test_.
    // The Clerk Dev banner itself only goes away with pk_live_ (env, not code).
    unsafe_disableDevelopmentModeWarnings: true,
  },
  elements: {
    footerPages: { display: "none" },
  },
} satisfies NonNullable<ClerkProviderProps["appearance"]>;

/** Application-looking copy so auth does not read as generic Clerk. */
export const clerkLocalization = {
  signIn: {
    start: {
      title: "Sign in to HoneyMatcha",
      titleCombined: "Continue to HoneyMatcha",
      subtitle: "Welcome back: your assistant is waiting.",
    },
  },
  signUp: {
    start: {
      title: "Create your HoneyMatcha account",
      titleCombined: "Create your HoneyMatcha account",
      subtitle: "Connect your calendar, then let your assistant handle the rest.",
    },
  },
} satisfies NonNullable<ClerkProviderProps["localization"]>;
