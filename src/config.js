const MB = 1024 * 1024;
const GB = 1024 * MB;

// 1.2TB max file size
export const maximumFileSize = 1024 * GB + 200 * GB;

// preferred part size = 128MB
//   128 * 10,000 = max file size 1.2TB
export const preferredPartSize = 128 * MB;

// maximum number of parts
export const maximumParts = 10000;

// Supported TUS extensions
export const tusExtensions = "creation,expiration,termination";
