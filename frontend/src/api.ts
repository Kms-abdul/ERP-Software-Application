import axios, {
  AxiosInstance,
  AxiosRequestConfig,
  AxiosResponse,
  InternalAxiosRequestConfig,
  AxiosError
} from 'axios';
import { API_URL, ApiResponse, ApiError } from './config';

// Types for localStorage data
interface UserData {
  branch?: string;
  location?: string;
  role?: string;
  email?: string;
  id?: string | number;
}

// Types for request headers
interface CustomHeaders {
  'Authorization'?: string;
  'X-Branch'?: string;
  'X-Location'?: string;
  'X-Academic-Year'?: string;
  'X-Requested-With'?: string;
  [key: string]: string | undefined;
}

// Extend AxiosRequestConfig to include our custom headers
interface CustomAxiosRequestConfig extends AxiosRequestConfig {
  headers?: CustomHeaders;
}

const getStoredToken = (): string | null => {
  return sessionStorage.getItem('token') || localStorage.getItem('token');
};

const clearStoredAuth = (): void => {
  sessionStorage.removeItem('token');
  localStorage.removeItem('token');
  localStorage.removeItem('user');
  localStorage.removeItem('currentBranch');
  localStorage.removeItem('academicYear');
};

// Create a configured axios instance with TypeScript types
const api: AxiosInstance = axios.create({
  baseURL: API_URL,
  withCredentials: true, // Important for cookies/sessions
  timeout: 30000, // 30 seconds timeout
  headers: {
    'Content-Type': 'application/json',
    'Accept': 'application/json',
    'X-Requested-With': 'XMLHttpRequest',
  },
});

const shouldLogApi = import.meta.env.DEV && import.meta.env.VITE_LOG_API === 'true';

// Request interceptor
api.interceptors.request.use(
  (config: InternalAxiosRequestConfig): InternalAxiosRequestConfig => {
    // Safely get items from localStorage
    const savedUser: string | null = localStorage.getItem('user');
    const academicYear: string | null = localStorage.getItem('academicYear');
    const currentBranch: string | null = localStorage.getItem('currentBranch');
    const token: string | null = getStoredToken();

    // Add Authorization header if token exists
    if (token) {
      config.headers = config.headers || {};
      config.headers['Authorization'] = `Bearer ${token}`;
    }

    // Parse user data and add custom headers
    if (savedUser) {
      try {
        const user: UserData = JSON.parse(savedUser);

        // Add branch header
        if (currentBranch && !currentBranch.toLowerCase().startsWith('all')) {
          config.headers = config.headers || {};
          config.headers['X-Branch'] = currentBranch;
        } else if (!currentBranch && user.branch && !user.branch.toLowerCase().startsWith('all')) {
          config.headers = config.headers || {};
          config.headers['X-Branch'] = user.branch;
        }

        // Add location header
        if (user.location) {
          config.headers = config.headers || {};
          config.headers['X-Location'] = user.location;
        }
      } catch (error) {
        console.error('Error parsing user data from localStorage:', error);
      }
    }

    // Add academic year header (with fallback)
    if (!config.headers?.['X-Academic-Year']) {
      const effectiveYear = academicYear || localStorage.getItem('academicYear');
      if (effectiveYear) {
        config.headers = config.headers || {};
        config.headers['X-Academic-Year'] = effectiveYear;
      }
    }

    // Log request in development
    if (shouldLogApi) {
      console.log(`API Request: ${config.method?.toUpperCase()} ${config.baseURL}${config.url}`);
    }

    return config;
  },
  (error: AxiosError): Promise<AxiosError> => {
    console.error('Request interceptor error:', error);
    return Promise.reject(error);
  }
);

// Response interceptor
api.interceptors.response.use(
  (response: AxiosResponse): AxiosResponse => {
    // Log response in development
    if (shouldLogApi) {
      console.log(`API Response: ${response.status} ${response.config.url}`);
    }
    
    // You can transform response data here if needed
    return response;
  },
  async (error: AxiosError<ApiError>): Promise<AxiosError<ApiError>> => {
    const originalRequest = error.config as CustomAxiosRequestConfig & { _retry?: boolean };
    
    // Handle 401 Unauthorized (token expired)
    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;
      
      // Clear auth data
      clearStoredAuth();
      
      // Redirect to login
      if (!window.location.pathname.includes('/login')) {
        window.location.href = '/login';
      }
      
      return Promise.reject({
        ...error,
        message: 'Session expired. Please login again.'
      } as AxiosError<ApiError>);
    }
    
    // Handle 403 Forbidden
    if (error.response?.status === 403) {
      console.error('Access forbidden:', error.response.data);
      // You could redirect to an unauthorized page here
    }
    
    // Handle 404 Not Found
    if (error.response?.status === 404) {
      console.error('Resource not found:', error.config?.url);
    }
    
    // Handle 500 Server Error
    if (error.response?.status === 500) {
      console.error('Server error:', error.response.data);
    }
    
    // Handle network errors
    if (!error.response) {
      console.error('Network error - backend might be down:', error.message);
      
      // Check if we're in production and show appropriate message
      if (import.meta.env.PROD) {
        return Promise.reject({
          ...error,
          message: 'Cannot connect to server. Please check your internet connection.'
        } as AxiosError<ApiError>);
      }
    }
    
    return Promise.reject(error);
  }
);

// Helper function to handle API responses
export const handleApiResponse = <T>(response: AxiosResponse<T>): ApiResponse<T> => {
  return {
    data: response.data,
    status: response.status,
    message: response.data?.['message' as keyof T] as string || 'Success',
    timestamp: new Date().toISOString(),
  };
};

// Helper function to handle API errors
export const handleApiError = (error: AxiosError<ApiError>): ApiError => {
  if (error.response) {
    return {
      status: error.response.status,
      message: error.response.data?.message || error.message,
      errors: error.response.data?.errors,
      timestamp: error.response.data?.timestamp || new Date().toISOString(),
    };
  }
  
  return {
    status: 0,
    message: error.message || 'Network error',
    timestamp: new Date().toISOString(),
  };
};

// Authentication helper functions
export const auth = {
  // Set authentication token
  setToken: (token: string): void => {
    localStorage.setItem('token', token);
    // Update axios default headers
    api.defaults.headers.common['Authorization'] = `Bearer ${token}`;
    sessionStorage.setItem('token', token);
    localStorage.setItem('token', token);
  },
  
  // Remove authentication token
    clearToken: (): void => {
    sessionStorage.removeItem('token');
    localStorage.removeItem('token');
    delete api.defaults.headers.common['Authorization'];
  },
  
  // Check if user is authenticated
  isAuthenticated: (): boolean => {
    return !!getStoredToken();
  },
  
  // Get current token
  getToken: (): string | null => {
    return getStoredToken();
  },
};

// Export the configured API instance
export default api;

// Export types for use in other files
export type { UserData, CustomAxiosRequestConfig };
