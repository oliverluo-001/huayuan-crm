import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Res,
  UploadedFile,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { Response } from "express";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { Roles } from "../../common/decorators/roles.decorator";
import { CreateCustomerAttachmentDto } from "./customer-attachments.dto";
import { CustomerAttachmentsService } from "./customer-attachments.service";

interface RequestUser {
  sub: number;
  role: "admin" | "sales" | "viewer";
}

const ownerId = (user: RequestUser) =>
  user.role === "sales" ? String(user.sub) : undefined;

@Controller()
export class CustomerAttachmentsController {
  constructor(
    private readonly attachmentsService: CustomerAttachmentsService,
  ) {}

  @Get("customers/:customerId/attachments")
  list(
    @Param("customerId") customerId: string,
    @CurrentUser() user: RequestUser,
  ) {
    return this.attachmentsService.list(+customerId, ownerId(user));
  }

  @Post("customers/:customerId/attachments")
  @Roles("admin", "sales")
  @UseInterceptors(
    FileInterceptor("file", {
      limits: { fileSize: 20 * 1024 * 1024, files: 1 },
    }),
  )
  upload(
    @Param("customerId") customerId: string,
    @UploadedFile() file: any,
    @Body() dto: CreateCustomerAttachmentDto,
    @CurrentUser() user: RequestUser,
  ) {
    if (!file) throw new BadRequestException("请选择需要上传的附件");
    return this.attachmentsService.create(
      +customerId,
      file,
      dto,
      ownerId(user),
      String(user.sub),
    );
  }

  @Get("attachments/:id/download")
  async download(
    @Param("id") id: string,
    @CurrentUser() user: RequestUser,
    @Res() response: Response,
  ) {
    const { attachment, filePath } = await this.attachmentsService.getDownload(
      +id,
      ownerId(user),
    );
    response.type(attachment.mimeType || "application/octet-stream");
    return response.download(filePath, attachment.originalName);
  }

  @Delete("attachments/:id")
  @Roles("admin", "sales")
  remove(@Param("id") id: string, @CurrentUser() user: RequestUser) {
    return this.attachmentsService.remove(+id, ownerId(user));
  }
}
