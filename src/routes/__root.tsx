import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";
import { Toaster as Sonner, type ToasterProps } from "sonner";

import appCss from "../styles.css?url";
import { AuthProvider } from "../lib/live/auth";
import { AuthProvider as LegacyAuthProvider } from "../lib/auth";
import { DemoTour } from "../components/live/demo-tour";
import { isStaleChunkError, reloadForNewVersion, reportClientError } from "../lib/live/report-error";

// Live root: index-LBNWlUO7.js (route R, shell vo, component yo, 404 go, error L).

const themeBootstrap = `try{if(localStorage.getItem("tracker.theme")==="dark")document.documentElement.classList.add("dark")}catch(e){}`;

/** Live toaster: inverted (foreground) toasts, rounded-xl, 13px. */
function Toaster(props: ToasterProps) {
  return (
    <Sonner
      className="toaster group"
      toastOptions={{
        classNames: {
          toast:
            "group toast group-[.toaster]:bg-foreground group-[.toaster]:text-background group-[.toaster]:border-foreground group-[.toaster]:shadow-float group-[.toaster]:rounded-xl group-[.toaster]:text-[13px]",
          description: "group-[.toast]:text-background/70",
          actionButton: "group-[.toast]:bg-primary group-[.toast]:text-primary-foreground",
          cancelButton: "group-[.toast]:bg-muted group-[.toast]:text-muted-foreground",
        },
      }}
      {...props}
    />
  );
}

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">Page not found</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Go home
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  const router = useRouter();
  useEffect(() => {
    if (isStaleChunkError(error)) {
      reloadForNewVersion();
      return;
    }
    const message = error instanceof Error ? error.message : String(error);
    void reportClientError({
      page: typeof window !== "undefined" ? window.location.pathname : "/",
      errorTitle: `Page load failed: ${message.slice(0, 100)}`,
      errorMessage: message,
      errorStack: error instanceof Error ? error.stack : undefined,
      category: "route_error",
    });
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">This page didn't load</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Something went wrong on our end. You can try refreshing or head back home.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => {
              void router.invalidate();
              reset();
            }}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Try again
          </button>
          <a
            href="/"
            className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            Go home
          </a>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "Tracker" },
      { name: "description", content: "A simple tracker for cold outreach, CRM and revenue." },
      { property: "og:title", content: "Tracker" },
      { property: "og:description", content: "A simple tracker for cold outreach, CRM and revenue." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600;700&family=Geist+Mono:wght@400;500;600&display=swap",
      },
      { rel: "stylesheet", href: appCss },
      // TODO(asset): live serves /favicon.svg; this repo only has /favicon.ico.
      { rel: "icon", href: "/favicon.svg", type: "image/svg+xml" },
      { rel: "icon", href: "/favicon.ico", type: "image/x-icon" },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeBootstrap }} />
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();

  // A new deploy invalidates old chunk URLs; reload once instead of erroring.
  useEffect(() => {
    const onPreloadError = (e: Event) => {
      if (reloadForNewVersion()) e.preventDefault();
    };
    window.addEventListener("vite:preloadError", onPreloadError);
    return () => window.removeEventListener("vite:preloadError", onPreloadError);
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        {/* TODO: drop LegacyAuthProvider once no file imports useAuth from "@/lib/live/auth". */}
        <LegacyAuthProvider>
          {/* Required: nested routes render here. Removing <Outlet /> breaks all child routes. */}
          <Outlet />
          <Toaster />
          <DemoTour />
        </LegacyAuthProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}
