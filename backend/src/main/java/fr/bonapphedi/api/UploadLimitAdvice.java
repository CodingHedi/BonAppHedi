package fr.bonapphedi.api;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.multipart.MaxUploadSizeExceededException;

/**
 * The 413 for an upload too large for the container to even parse.
 *
 * <p><b>Advice rather than a handler on {@code AdminController}, and that is
 * the whole reason this class exists.</b> Multipart resolution happens in
 * {@code DispatcherServlet} before a handler is chosen, so when the limit is
 * exceeded there is no controller in hand and a handler declared on one is
 * never consulted. The answer would be a 500 — an upload that is merely too
 * big, reported as the server having broken.
 *
 * <p>{@code PhotoIngest} enforces the real limit and answers 413 itself, and
 * that is the path the suite covers. This is the outer one: the container's
 * ceiling sits above the application's on purpose, so an ordinary oversized
 * photograph is refused by the code that can explain itself, and only something
 * far larger arrives here.
 *
 * <p><b>Not covered by the suite, unusually.</b> MockMvc builds a multipart
 * request directly rather than parsing one, so the resolver whose limit this
 * reports never runs. Asserting on it would need a running server, and a test
 * that cannot fail is worse than a documented gap.
 */
@RestControllerAdvice
public class UploadLimitAdvice {

    @ExceptionHandler(MaxUploadSizeExceededException.class)
    public ResponseEntity<Void> tooLarge() {
        return ResponseEntity.status(HttpStatus.PAYLOAD_TOO_LARGE).build();
    }
}
