import { createApiError } from './httpClient';
import { getBackendBaseUrl } from './backendHealth';

/**
 * Upload a Baki photo to the backend.
 *
 * @param {object} params
 * @param {string} params.imageUri     - Local file URI (file://...)
 * @param {number} params.customerId   - Customer ID this entry belongs to
 * @param {string} [params.accessToken]
 * @returns {Promise<{image_url: string}>}
 */
export const uploadBakiImage = async ({ imageUri, customerId, accessToken = null }) => {
  const baseUrl = getBackendBaseUrl();
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 30000);

  try {
    const filename = imageUri.split('/').pop() || 'photo.jpg';
    const ext = filename.split('.').pop().toLowerCase();
    const mimeType = ext === 'png' ? 'image/png' : 'image/jpeg';

    const form = new FormData();
    form.append('image', { uri: imageUri, name: filename, type: mimeType });
    form.append('customer_id', String(customerId));

    const headers = { Accept: 'application/json' };
    if (accessToken) {
      headers.Authorization = `Bearer ${accessToken}`;
    }

    const response = await fetch(`${baseUrl}/baki/upload-image`, {
      method: 'POST',
      headers,
      body: form,
      signal: controller.signal,
    });

    let payload = null;
    try { payload = await response.json(); } catch { payload = null; }

    if (!response.ok) {
      throw createApiError({
        message: payload?.error?.message || payload?.message || `Upload failed (${response.status})`,
        status: response.status,
        code: payload?.error?.code || payload?.code || null,
      });
    }

    return payload?.data || payload;
  } catch (error) {
    if (error?.name === 'AbortError') {
      throw createApiError({ message: 'ছবি আপলোড সময়সীমা পেরিয়ে গেছে।', isNetworkError: true });
    }
    if (error?.status || error?.code || error?.isNetworkError) throw error;
    throw createApiError({ message: error?.message || 'ছবি আপলোড করা যায়নি।', isNetworkError: true });
  } finally {
    clearTimeout(timeoutId);
  }
};
