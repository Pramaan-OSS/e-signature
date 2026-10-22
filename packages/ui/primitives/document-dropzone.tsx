import { useCurrentOrganisation } from '@e-sign/lib/client-only/providers/organisation';
import { IS_BILLING_ENABLED } from '@e-sign/lib/constants/app';
import {
  documentConversionNotice,
  documentUploadLimit,
  documentUploadMaxSize,
  getAllowedUploadMimeTypes,
  validateDocumentUpload,
} from '@e-sign/lib/constants/document-conversion';
import type { MessageDescriptor } from '@lingui/core';
import { msg } from '@lingui/core/macro';
import { useLingui } from '@lingui/react';
import { Trans } from '@lingui/react/macro';
import { motion } from 'framer-motion';
import { AlertTriangle, Plus } from 'lucide-react';
import type { FileRejection } from 'react-dropzone';
import { useDropzone } from 'react-dropzone';
import { Link } from 'react-router';

import {
  DocumentDropzoneCardCenterVariants,
  DocumentDropzoneCardLeftVariants,
  DocumentDropzoneCardRightVariants,
  DocumentDropzoneContainerVariants,
  DocumentDropzoneDisabledCardCenterVariants,
  DocumentDropzoneDisabledCardLeftVariants,
  DocumentDropzoneDisabledCardRightVariants,
} from '../lib/document-dropzone-constants';
import { cn } from '../lib/utils';
import { Button } from './button';
import { Card, CardContent } from './card';

export type DocumentDropzoneProps = {
  className?: string;
  allowMultiple?: boolean;
  allowWord?: boolean;
  disabled?: boolean;
  disabledHeading?: MessageDescriptor;
  disabledMessage?: MessageDescriptor;
  onDrop?: (_file: File[]) => void | Promise<void>;
  onDropRejected?: (fileRejections: FileRejection[]) => void;
  type?: 'document' | 'template';
  maxFiles?: number;
  [key: string]: unknown;
};

export const DocumentDropzone = ({
  className,
  allowMultiple,
  allowWord = true,
  onDrop,
  onDropRejected,
  disabled,
  disabledHeading,
  disabledMessage = msg`You cannot upload documents at this time.`,
  type = 'document',
  maxFiles,
  ...props
}: DocumentDropzoneProps) => {
  const { _ } = useLingui();

  const organisation = useCurrentOrganisation();

  const { getRootProps, getInputProps } = useDropzone({
    accept: allowWord ? getAllowedUploadMimeTypes() : { 'application/pdf': ['.pdf'] },
    multiple: allowMultiple,
    disabled,
    onDrop: (acceptedFiles) => {
      if (acceptedFiles.length > 0 && onDrop) {
        void onDrop(acceptedFiles);
      }
    },
    onDropRejected,
    maxFiles,
    maxSize: allowWord ? documentUploadMaxSize() : documentUploadLimit('application/pdf'),
    validator: validateDocumentUpload,
  });

  const heading = {
    document: disabled ? disabledHeading || msg`You have reached your document limit.` : msg`Add a document`,
    template: msg`Upload Template Document`,
  };

  return (
    <motion.div variants={DocumentDropzoneContainerVariants} initial="initial" animate="animate" whileHover="hover">
      <Card
        role="button"
        className={cn(
          'group flex flex-1 cursor-pointer flex-col items-center justify-center ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
          className,
        )}
        gradient={!disabled}
        degrees={120}
        aria-disabled={disabled}
        {...getRootProps()}
        {...props}
      >
        <CardContent
          title={allowWord ? documentConversionNotice() : 'Upload a PDF.'}
          className="flex flex-col items-center justify-center p-6 text-muted-foreground/40"
        >
          <p className="mb-3 max-w-sm text-center text-muted-foreground text-sm">
            {allowWord ? documentConversionNotice() : 'Upload a PDF.'}
          </p>
          {disabled ? (
            // Disabled State
            <div className="flex">
              <motion.div
                className="a z-10 flex aspect-[3/4] w-24 origin-top-right -rotate-[22deg] flex-col gap-y-1 rounded-lg border border-muted-foreground/20 bg-background/80 px-2 py-4 backdrop-blur-sm group-hover:border-destructive/10 group-hover:bg-destructive/2"
                variants={DocumentDropzoneDisabledCardLeftVariants}
              >
                <div className="h-2 w-full rounded-[2px] bg-muted-foreground/10 group-hover:bg-destructive/10" />
                <div className="h-2 w-5/6 rounded-[2px] bg-muted-foreground/10 group-hover:bg-destructive/10" />
                <div className="h-2 w-full rounded-[2px] bg-muted-foreground/10 group-hover:bg-destructive/10" />
              </motion.div>
              <motion.div
                className="z-20 flex aspect-[3/4] w-24 flex-col items-center justify-center gap-y-1 rounded-lg border border-muted-foreground/20 bg-background/80 px-2 py-4 backdrop-blur-sm group-hover:border-destructive/50 group-hover:bg-destructive/5"
                variants={DocumentDropzoneDisabledCardCenterVariants}
              >
                <AlertTriangle
                  strokeWidth="2px"
                  className="h-12 w-12 text-muted-foreground/20 group-hover:text-destructive"
                />
              </motion.div>
              <motion.div
                className="z-10 flex aspect-[3/4] w-24 origin-top-left rotate-[22deg] flex-col gap-y-1 rounded-lg border border-muted-foreground/20 bg-background/80 px-2 py-4 backdrop-blur-sm group-hover:border-destructive/10 group-hover:bg-destructive/2"
                variants={DocumentDropzoneDisabledCardRightVariants}
              >
                <div className="h-2 w-full rounded-[2px] bg-muted-foreground/10 group-hover:bg-destructive/10" />
                <div className="h-2 w-5/6 rounded-[2px] bg-muted-foreground/10 group-hover:bg-destructive/10" />
                <div className="h-2 w-full rounded-[2px] bg-muted-foreground/10 group-hover:bg-destructive/10" />
              </motion.div>
            </div>
          ) : (
            // Non Disabled State
            <div className="flex">
              <motion.div
                className="a z-10 flex aspect-[3/4] w-24 origin-top-right -rotate-[22deg] flex-col gap-y-1 rounded-lg border border-muted-foreground/20 bg-background/80 px-2 py-4 backdrop-blur-sm group-hover:border-esign/80"
                variants={DocumentDropzoneCardLeftVariants}
              >
                <div className="h-2 w-full rounded-[2px] bg-muted-foreground/20 group-hover:bg-esign" />
                <div className="h-2 w-5/6 rounded-[2px] bg-muted-foreground/20 group-hover:bg-esign" />
                <div className="h-2 w-full rounded-[2px] bg-muted-foreground/20 group-hover:bg-esign" />
              </motion.div>
              <motion.div
                className="z-20 flex aspect-[3/4] w-24 flex-col items-center justify-center gap-y-1 rounded-lg border border-muted-foreground/20 bg-background/80 px-2 py-4 backdrop-blur-sm group-hover:border-esign/80"
                variants={DocumentDropzoneCardCenterVariants}
              >
                <Plus strokeWidth="2px" className="h-12 w-12 text-muted-foreground/20 group-hover:text-esign" />
              </motion.div>
              <motion.div
                className="z-10 flex aspect-[3/4] w-24 origin-top-left rotate-[22deg] flex-col gap-y-1 rounded-lg border border-muted-foreground/20 bg-background/80 px-2 py-4 backdrop-blur-sm group-hover:border-esign/80"
                variants={DocumentDropzoneCardRightVariants}
              >
                <div className="h-2 w-full rounded-[2px] bg-muted-foreground/20 group-hover:bg-esign" />
                <div className="h-2 w-5/6 rounded-[2px] bg-muted-foreground/20 group-hover:bg-esign" />
                <div className="h-2 w-full rounded-[2px] bg-muted-foreground/20 group-hover:bg-esign" />
              </motion.div>
            </div>
          )}

          <input {...getInputProps()} />

          <p className="mt-6 font-medium text-foreground">{_(heading[type])}</p>

          <p className="mt-1 text-center text-muted-foreground/80 text-sm">
            {_(disabled ? disabledMessage : msg`Drag & drop your document here.`)}
          </p>

          {disabled && IS_BILLING_ENABLED() && (
            <Button className="mt-4 w-32 bg-warning hover:bg-warning/80" asChild>
              <Link to={`/o/${organisation.url}/settings/billing`}>
                <Trans>Upgrade</Trans>
              </Link>
            </Button>
          )}
        </CardContent>
      </Card>
    </motion.div>
  );
};
