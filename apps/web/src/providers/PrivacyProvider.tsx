import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import {
  ADVERTISING_AVAILABLE,
  setAdvertisingEnabled,
} from '@/lib/advertising';
import { setAnalyticsEnabled } from '@/lib/analytics';
import {
  effectivePrivacyChoices,
  parsePrivacyConsent,
  PRIVACY_CONSENT_STORAGE_KEY,
  readPrivacyConsent,
  writePrivacyConsent,
  type PrivacyChoices,
  type StoredPrivacyConsent,
} from '@/lib/privacy-consent';

interface PrivacyContextValue {
  choices: PrivacyChoices;
  hasDecision: boolean;
  isSettingsOpen: boolean;
  openSettings: () => void;
  closeSettings: () => void;
  saveChoices: (choices: PrivacyChoices) => void;
}

const PrivacyContext = createContext<PrivacyContextValue | null>(null);

function getInitialConsent(): StoredPrivacyConsent | null {
  if (typeof window === 'undefined') return null;
  try {
    return readPrivacyConsent(window.localStorage);
  } catch {
    return null;
  }
}

export function PrivacyProvider({ children }: { children: ReactNode }) {
  const [storedConsent, setStoredConsent] =
    useState<StoredPrivacyConsent | null>(getInitialConsent);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const choices = useMemo(
    () => effectivePrivacyChoices(storedConsent, ADVERTISING_AVAILABLE),
    [storedConsent]
  );

  useEffect(() => {
    setAnalyticsEnabled(choices.analytics);
    setAdvertisingEnabled(choices.advertising);
  }, [choices.analytics, choices.advertising]);

  useEffect(() => {
    const handleStorage = (event: StorageEvent) => {
      if (event.key !== PRIVACY_CONSENT_STORAGE_KEY) return;
      setStoredConsent(parsePrivacyConsent(event.newValue));
    };

    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, []);

  const saveChoices = useCallback((nextChoices: PrivacyChoices) => {
    let storage: Storage | undefined;
    try {
      storage = window.localStorage;
    } catch {
      storage = undefined;
    }
    const nextConsent = writePrivacyConsent(storage, {
      analytics: nextChoices.analytics,
      advertising: ADVERTISING_AVAILABLE && nextChoices.advertising,
    });
    setStoredConsent(nextConsent);
    setIsSettingsOpen(false);
  }, []);

  const value = useMemo<PrivacyContextValue>(
    () => ({
      choices,
      hasDecision: storedConsent !== null,
      isSettingsOpen,
      openSettings: () => setIsSettingsOpen(true),
      closeSettings: () => setIsSettingsOpen(false),
      saveChoices,
    }),
    [choices, isSettingsOpen, saveChoices, storedConsent]
  );

  return (
    <PrivacyContext.Provider value={value}>{children}</PrivacyContext.Provider>
  );
}

export function usePrivacyConsent(): PrivacyContextValue {
  const context = useContext(PrivacyContext);
  if (!context) {
    throw new Error('usePrivacyConsent must be used within PrivacyProvider');
  }
  return context;
}
