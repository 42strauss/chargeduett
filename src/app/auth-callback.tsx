// Ziel des OAuth-Redirects (chargeduett://auth-callback). Die eigentliche
// Verarbeitung passiert in signInWithGoogle(); hier nur ein Ladezustand,
// bis das Gate im Root-Layout weiterleitet.
import { Loading } from '@/components/ui';

export default function AuthCallback() {
  return <Loading />;
}
