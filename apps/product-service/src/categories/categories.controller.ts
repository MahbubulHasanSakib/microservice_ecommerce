import { Controller } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import { CATEGORY_PATTERNS, CategoryResponse } from '@ecommerce/shared';
import { CategoriesService } from './categories.service';
import { CreateCategoryDto } from './dto/create-category.dto';

@Controller()
export class CategoriesController {
  constructor(private readonly categoriesService: CategoriesService) {}

  @MessagePattern(CATEGORY_PATTERNS.CREATE)
  async create(@Payload() dto: CreateCategoryDto): Promise<CategoryResponse> {
    return this.categoriesService.create(dto);
  }

  @MessagePattern(CATEGORY_PATTERNS.FIND_BY_ID)
  async findById(@Payload() data: { id: string }): Promise<CategoryResponse> {
    return this.categoriesService.findById(data.id);
  }

  @MessagePattern(CATEGORY_PATTERNS.LIST)
  async findAll(): Promise<CategoryResponse[]> {
    return this.categoriesService.findAll();
  }
}
