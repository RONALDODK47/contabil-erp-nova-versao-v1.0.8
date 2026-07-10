/**
 * Ponte Eye Vision → Gestão Contábil: admin vê o escritório inteiro (não só bootstrap).
 */
import {
  useCloudAccess as useGestaoCloudAccess,
  CLOUD_ADMIN_EMAIL,
} from '../../vendor/gestao-contabil/src/lib/useCloudAccess.js';

export { CLOUD_ADMIN_EMAIL };

export function useCloudAccess() {
  const access = useGestaoCloudAccess();
  if (!access.isAdminEmail) return access;

  return {
    ...access,
    internalStaffFullAccess: true,
    isMasterUser: true,
    companyTokenOk: true,
    canUseSystem: true,
    canEditCompanyTasks: true,
    canCreateCompanies: true,
    canCreateCompanyTasks: true,
    canEditCalendar: true,
    canSeeAppSettings: true,
    canEditOfficeBranding: true,
  };
}
