import posthog from "posthog-js";
import { PostHogProvider } from "posthog-js/react";
import { PropsWithChildren, useEffect } from "react";
import { useAppSelector } from "../redux/hooks";
import { RootState } from "../redux/store";

const CustomPostHogProvider = ({ children }: PropsWithChildren) => {
  const allowAnonymousTelemetry = useAppSelector(
    (store) => store?.config?.config?.allowAnonymousTelemetry,
  );

  const config = useAppSelector(
    (store: RootState) => store.config
  )

  useEffect(() => {
    if (allowAnonymousTelemetry) {
      posthog.init(process.env.POSTHOG_API_KEY, {
        api_host: "https://app.posthog.com",
        disable_session_recording: true,
        autocapture: false,
        // // We need to manually track pageviews since we're a SPA
        capture_pageleave: false,
        capture_pageview: false,
      });
      posthog.identify(window.vscMachineId, {
        accountName: config.accountName,
        accountEmail: config.accountEmail,
        lastSeen: new Date().toISOString(),
      });
      posthog.opt_in_capturing();
    } else {
      posthog.opt_out_capturing();
    }
  }, [allowAnonymousTelemetry, config]);

  return <PostHogProvider client={posthog}>{children}</PostHogProvider>;
};

export default CustomPostHogProvider;
