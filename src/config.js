// 1TB max file size
export const maximumFileSize = 1024 * 1024 * 1024 * 1024;

// minimum part size = 5MB
// export const minimumPartSize = 5 * 1024 * 1024;

// preferred part size = 128MB
//   128 * 10,000 = max file size 1.2TB
export const preferredPartSize = 128 * 1024 * 1024;

// maximum number of parts
export const maximumParts = 10000;

// Supported TUS extensions
export const tusExtensions = "creation,expiration,termination";
