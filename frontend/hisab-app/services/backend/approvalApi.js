import { requestBackendJson } from './httpClient';

const toQuery = (params = {}) => {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value === null || value === undefined || value === '') {
      return;
    }
    search.set(key, String(value));
  });
  const text = search.toString();
  return text ? `?${text}` : '';
};

export const listApprovalRequestsOnline = async ({ accessToken, status = 'PENDING', actionType = null } = {}) => {
  return requestBackendJson({
    path: `/api/v1/approvals${toQuery({ status, actionType })}`,
    method: 'GET',
    accessToken,
  });
};

export const approveApprovalRequestOnline = async ({ accessToken, approvalRequestId, decisionNote = null } = {}) => {
  return requestBackendJson({
    path: `/api/v1/approvals/${encodeURIComponent(String(approvalRequestId || ''))}/approve`,
    method: 'POST',
    accessToken,
    body: {
      decisionNote,
    },
  });
};

export const rejectApprovalRequestOnline = async ({ accessToken, approvalRequestId, decisionNote = null } = {}) => {
  return requestBackendJson({
    path: `/api/v1/approvals/${encodeURIComponent(String(approvalRequestId || ''))}/reject`,
    method: 'POST',
    accessToken,
    body: {
      decisionNote,
    },
  });
};
