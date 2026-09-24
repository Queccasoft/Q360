#include <emscripten.h>
#include <emscripten/bind.h>
#include <fpdfview.h>
#include <fpdf_doc.h>
#include <iostream>
#include <vector>
#include <string>

// Global pointers for the active document and page
FPDF_DOCUMENT g_document = nullptr;
FPDF_PAGE g_page = nullptr;

extern "C" {

// 1. Initialize PDFium Library
EMSCRIPTEN_KEEPALIVE
void init_pdf_engine() {
    FPDF_InitLibrary();
    std::cout << "PDFium Engine Initialized Successfully." << std::endl;
}

// 2. Load PDF from a JavaScript-passed memory buffer
EMSCRIPTEN_KEEPALIVE
bool load_pdf_document(uint8_t* buffer, int size) {
    if (g_document) {
        FPDF_CloseDocument(g_document);
        g_document = nullptr;
    }
    
    g_document = FPDF_LoadMemDocument(buffer, size, nullptr);
    return g_document != nullptr;
}

// 3. Render a specific page to a raw pixel buffer (RGBA)
EMSCRIPTEN_KEEPALIVE
uint8_t* render_pdf_page(int page_index, int width, int height) {
    if (!g_document) return nullptr;

    if (g_page) FPDF_ClosePage(g_page);
    g_page = FPDF_LoadPage(g_document, page_index);
    if (!g_page) return nullptr;

    // Create a PDFium bitmap buffer
    FPDF_BITMAP bitmap = FPDFBitmap_Create(width, height, 1);
    // Fill background with white (0xFFFFFFFF)
    FPDFBitmap_FillRect(bitmap, 0, 0, width, height, 0xFFFFFFFF);

    // Render the page into the bitmap
    FPDF_RenderPageBitmap(bitmap, g_page, 0, 0, width, height, 0, 0);

    // Get access to the raw buffer bytes
    uint8_t* buffer = reinterpret_cast<uint8_t*>(FPDFBitmap_GetBuffer(bitmap));
    
    // Note: In production, manage this buffer memory safely!
    return buffer; 
}

// 4. THE INTERCEPTOR: Checks if a click hits an internal or external link
EMSCRIPTEN_KEEPALIVE
void handle_pdf_click(double x, double y, double page_width, double page_height) {
    if (!g_page) return;

    // Convert screen coordinates to PDF page coordinates
    // PDFium uses a coordinate system starting from the bottom-left
    double pdf_x = x;
    double pdf_y = page_height - y; 

    // Find if there is a link at these coordinates
    FPDF_LINK link = FPDFLink_GetLinkAtPoint(g_page, pdf_x, pdf_y);
    if (!link) return;

    // Extract action or URI from link
    FPDF_ACTION action = FPDFLink_GetAction(link);
    if (action) {
        unsigned long buffer_size = FPDFAction_GetURIPath(g_document, action, nullptr, 0);
        if (buffer_size > 0) {
            std::vector<char> uri_buffer(buffer_size);
            FPDFAction_GetURIPath(g_document, action, uri_buffer.data(), buffer_size);
            std::string uri(uri_buffer.data());

            // --- CRITICAL BRIDGE: Pass URL back up to JavaScript globally ---
            EM_ASM_ARGS({
                if (window.handleDocumentLinkClick) {
                    window.handleDocumentLinkClick(UTF8ToString($0));
                } else {
                    console.warn("React front-end global link handler not ready yet.");
                }
            }, uri.c_str());
        }
    }
}

// 5. Cleanup memory when done
EMSCRIPTEN_KEEPALIVE
void shutdown_pdf_engine() {
    if (g_page) FPDF_ClosePage(g_page);
    if (g_document) FPDF_CloseDocument(g_document);
    FPDF_DestroyLibrary();
}

} // extern "C"