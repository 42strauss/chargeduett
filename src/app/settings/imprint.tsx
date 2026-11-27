/**
 * Impressum (§ 5 DDG) und Quellenangaben.
 * TODO vor dem Launch: Pflichtangaben der Strauss Media GmbH eintragen (siehe IMPRINT unten).
 */
import { Card, H2, P, Screen } from '@/components/ui';
import { PodcastBadge } from '@/components/PodcastBadge';
import { t } from '@/lib/i18n';

const IMPRINT = {
  company: 'Strauss Media GmbH',
  address: '[Straße Hausnummer, PLZ Ort – bitte eintragen]',
  managingDirector: '[Geschäftsführer:in – bitte eintragen]',
  contact: '[Telefon · E-Mail – bitte eintragen]',
  register: '[Amtsgericht, HRB-Nummer – bitte eintragen]',
  vatId: '[USt-IdNr. – bitte eintragen]',
  responsible: '[Verantwortlich nach § 18 Abs. 2 MStV – bitte eintragen]',
};

export default function Imprint() {
  return (
    <Screen edges={[]}>
      <PodcastBadge />
      <Card>
        <H2>{IMPRINT.company}</H2>
        <P>{IMPRINT.address}</P>
        <P>Geschäftsführung: {IMPRINT.managingDirector}</P>
        <P>{IMPRINT.contact}</P>
        <P>{IMPRINT.register}</P>
        <P>{IMPRINT.vatId}</P>
        <P>{IMPRINT.responsible}</P>
      </Card>
      <Card>
        <H2>Quellen</H2>
        <P small muted>{t('profile.dataSources')}</P>
      </Card>
    </Screen>
  );
}
