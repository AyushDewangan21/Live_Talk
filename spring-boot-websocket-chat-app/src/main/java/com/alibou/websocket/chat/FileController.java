package com.alibou.websocket.chat;

import org.springframework.core.io.Resource;
import org.springframework.core.io.UrlResource;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.util.StringUtils;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.servlet.support.ServletUriComponentsBuilder;

import java.io.IOException;
import java.net.MalformedURLException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

@RestController
public class FileController {

    private final Logger log = LoggerFactory.getLogger(FileController.class);
    private final Path uploadDir = Paths.get(System.getProperty("user.dir"), "uploads");
    private final SimpMessagingTemplate messagingTemplate;

    public FileController(SimpMessagingTemplate messagingTemplate) throws IOException {
        this.messagingTemplate = messagingTemplate;
        try {
            if (!Files.exists(uploadDir)) {
                Files.createDirectories(uploadDir);
            }
        } catch (IOException e) {
            log.error("Could not create upload directory {}", uploadDir, e);
            throw e;
        }
    }

    @PostMapping("/chat/upload")
    public ResponseEntity<?> uploadFile(
            @RequestParam("file") MultipartFile file,
            @RequestParam("sender") String sender,
            @RequestParam(value = "content", required = false) String content
    ) {
        if (file == null || file.isEmpty()) {
            return ResponseEntity.badRequest().body("File is missing");
        }

        String originalFilename = StringUtils.cleanPath(file.getOriginalFilename());
        String generated = UUID.randomUUID().toString() + "_" + originalFilename;
        Path target = uploadDir.resolve(generated);

        try {
            file.transferTo(target.toFile());
        } catch (Exception e) {
            // log full stack for debugging
            log.error("Failed to store uploaded file to {}", target, e);
            String msg = e.getClass().getSimpleName() + ": " + e.getMessage();
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).body("Could not store file: " + msg);
        }

        String fileUrl = ServletUriComponentsBuilder.fromCurrentContextPath()
                .path("/files/")
                .path(generated)
                .toUriString();

        ChatMessage chatMessage = ChatMessage.builder()
                .type(MessageType.FILE)
                .sender(sender)
                .content(content == null ? "" : content)
                .fileName(originalFilename)
                .fileUrl(fileUrl)
                .fileType(file.getContentType())
                .fileSize(file.getSize())
                .build();

        messagingTemplate.convertAndSend("/topic/public", chatMessage);

        return ResponseEntity.ok(chatMessage);
    }

    @GetMapping("/files/{filename:.+}")
    public ResponseEntity<Resource> serveFile(@PathVariable String filename) {
        try {
            Path file = uploadDir.resolve(filename).normalize();
            if (!Files.exists(file) || !Files.isReadable(file)) {
                return ResponseEntity.notFound().build();
            }

            Resource resource = new UrlResource(file.toUri());
            String contentType = Files.probeContentType(file);
            if (contentType == null) {
                contentType = MediaType.APPLICATION_OCTET_STREAM_VALUE;
            }

            HttpHeaders headers = new HttpHeaders();
            // inline for images and pdf, otherwise attachment
            if (contentType.startsWith("image/") || contentType.equals("application/pdf")) {
                headers.add(HttpHeaders.CONTENT_DISPOSITION, "inline; filename=\"" + resource.getFilename() + "\"");
            } else {
                headers.add(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=\"" + resource.getFilename() + "\"");
            }

            return ResponseEntity.ok()
                    .headers(headers)
                    .contentLength(resource.contentLength())
                    .contentType(MediaType.parseMediaType(contentType))
                    .body(resource);

        } catch (MalformedURLException e) {
            return ResponseEntity.notFound().build();
        } catch (IOException e) {
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).build();
        }
    }
}
