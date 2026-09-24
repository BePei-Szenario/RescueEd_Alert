ALTER TABLE `legal_documents` ADD `pdf_data` blob;
ALTER TABLE `legal_documents` ADD `pdf_file_name` text;
ALTER TABLE `legal_documents` ADD `pdf_hash` text;
ALTER TABLE `legal_document_versions` ADD `pdf_data` blob;
ALTER TABLE `legal_document_versions` ADD `pdf_file_name` text;
ALTER TABLE `legal_document_versions` ADD `pdf_hash` text;
