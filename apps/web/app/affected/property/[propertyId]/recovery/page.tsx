'use client';

import { useParams } from 'next/navigation';
import { RecoveryNavigator } from '@/components/finance/RecoveryNavigator';

export default function RecoveryPage() {
  const params = useParams<{ propertyId: string }>();
  return <RecoveryNavigator propertyIdParam={params.propertyId} />;
}
