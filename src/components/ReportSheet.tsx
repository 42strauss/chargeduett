import { useState } from 'react';
import { Modal, View } from 'react-native';
import { Alert } from '@/lib/dialog';
import { reportUser } from '@/lib/api';
import { showError } from '@/lib/errors';
import { t } from '@/lib/i18n';
import { radius, useTheme } from '@/lib/theme';
import type { ReportReason } from '@/lib/types';
import { Button, Chip, Field, H2, Row } from './ui';

const REASONS: ReportReason[] = ['fake', 'inappropriate_photo', 'harassment', 'spam', 'underage', 'safety', 'other'];

export function ReportSheet({
  userId,
  messageId,
  visible,
  onClose,
  onDone,
}: {
  userId: string;
  messageId?: number;
  visible: boolean;
  onClose: () => void;
  onDone: () => void;
}) {
  const c = useTheme();
  const [reason, setReason] = useState<ReportReason | null>(null);
  const [details, setDetails] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!reason) return;
    setBusy(true);
    try {
      await reportUser(userId, reason, details, messageId);
      Alert.alert(t('report.title'), t('report.thanks'));
      onDone();
    } catch (e) {
      showError(e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: c.overlay }}>
        <View style={{ backgroundColor: c.bg, padding: 20, gap: 16, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg }}>
          <H2>{t('report.title')}</H2>
          <Row wrap>
            {REASONS.map((r) => (
              <Chip key={r} label={t(`report.reasons.${r}`)} selected={reason === r} onPress={() => setReason(r)} />
            ))}
          </Row>
          <Field multiline placeholder={t('report.details')} value={details} onChangeText={setDetails} maxLength={1000} />
          <Button title={t('report.submit')} variant="danger" onPress={submit} disabled={!reason} loading={busy} />
          <Button title={t('common.cancel')} variant="ghost" onPress={onClose} />
        </View>
      </View>
    </Modal>
  );
}
