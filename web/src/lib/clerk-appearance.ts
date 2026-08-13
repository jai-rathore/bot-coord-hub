import type { ComponentProps } from "react";
import type { ClerkProvider } from "@clerk/nextjs";

type ClerkProviderProps = ComponentProps<typeof ClerkProvider>;

/** Shared Clerk UI branding for HoneyMatcha (embedded SignIn / SignUp / UserButton). */
export const clerkAppearance = {
  variables: {
    colorPrimary: "#1f4a36",
    colorBackground: "#fffcf6",
    colorForeground: "#1c2420",
    colorMutedForeground: "#5a685f",
    colorMuted: "#e4ede6",
    colorBorder: "#d5e0d6",
    colorInput: "#ffffff",
    colorInputForeground: "#1c2420",
    colorNeutral: "#1c2420",
    colorRing: "#2f6b4a",
    colorPrimaryForeground: "#f7faf6",
    borderRadius: "0.5rem",
  },
  options: {
    // Absolute production URL so Clerk’s hosted assets resolve the mark
    // (not the default Next/Vercel favicon). Vector source: /logo-mark.svg.
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
} satisfies NonNullable<ClerkProviderProps["appearance"]>;

/** Application-looking copy so auth does not read as generic Clerk. */
export const clerkLocalization = {
  signIn: {
    start: {
      title: "Sign in to HoneyMatcha",
      titleCombined: "Continue to HoneyMatcha",
      subtitle: "Welcome back — continue to your handshake dashboard.",
    },
  },
  signUp: {
    start: {
      title: "Create your HoneyMatcha account",
      titleCombined: "Create your HoneyMatcha account",
      subtitle: "Get a handshake URL for your bots — Google or email.",
    },
  },
} satisfies NonNullable<ClerkProviderProps["localization"]>;
