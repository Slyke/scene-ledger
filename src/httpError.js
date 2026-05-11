'use strict';

const { createErrorDetails, wrapError } = require('./errors');

const createStructuredClientError = ({ status, message, errorKey, caller, details, context }) => {
  const err = new Error(message);
  const errorDetails = createErrorDetails({
    caller,
    reason: message,
    errorKey,
    context: {
      ...(context ?? {}),
      status,
      responseDetails: details
    }
  });

  err.name = 'StructuredError';
  err.status = status;
  err.details = errorDetails;
  err.errorKey = errorDetails.errorKey;
  err.errorCode = errorDetails.errorCode;
  err.publicMessage = message;
  err.responseDetails = details;

  return err;
};

const createHttpError = ({
  status = 500,
  message,
  errorKey,
  caller,
  details,
  context,
  err,
  includeStackTrace = false
}) => {
  if (status < 500) {
    return createStructuredClientError({
      status,
      message,
      errorKey,
      caller,
      details,
      context
    });
  }

  const wrapped = wrapError({
    caller,
    reason: message,
    errorKey,
    err,
    includeStackTrace,
    context: {
      ...(context ?? {}),
      status,
      responseDetails: details
    }
  });

  wrapped.status = status;
  wrapped.publicMessage = message;
  wrapped.responseDetails = details;

  return wrapped;
};

module.exports = {
  createHttpError
};
