from rest_framework.pagination import PageNumberPagination
from rest_framework.response import Response


class StandardResultsSetPagination(PageNumberPagination):
    page_size = 10
    page_size_query_param = 'page_size'
    max_page_size = 1000


class AdminPagination(PageNumberPagination):
    """
    Unified pagination class for all admin panel table lists.
    Standardizes page sizing (default: 10), navigation metadata (count, total_pages,
    current_page, page_size), and optional org-wide metrics payload across all
    administrative endpoints.
    """
    page_size = 10
    page_size_query_param = 'page_size'
    max_page_size = 100

    def get_paginated_response(self, data):
        response_data = {
            'count': self.page.paginator.count,
            'total_pages': self.page.paginator.num_pages,
            'current_page': self.page.number,
            'page_size': self.get_page_size(self.request),
            'next': self.get_next_link(),
            'previous': self.get_previous_link(),
            'results': data,
        }
        metrics = getattr(self, 'metrics', None)
        if metrics is not None:
            response_data['metrics'] = metrics
        return Response(response_data)

    def get_paginated_response_schema(self, schema):
        return {
            'type': 'object',
            'properties': {
                'count': {
                    'type': 'integer',
                    'example': 123,
                },
                'total_pages': {
                    'type': 'integer',
                    'example': 13,
                },
                'current_page': {
                    'type': 'integer',
                    'example': 1,
                },
                'page_size': {
                    'type': 'integer',
                    'example': 10,
                },
                'next': {
                    'type': 'string',
                    'nullable': True,
                    'format': 'uri',
                    'example': 'http://api.example.org/accounts/?page=4',
                },
                'previous': {
                    'type': 'string',
                    'nullable': True,
                    'format': 'uri',
                    'example': 'http://api.example.org/accounts/?page=2',
                },
                'metrics': {
                    'type': 'object',
                    'nullable': True,
                    'additionalProperties': True,
                },
                'results': schema,
            },
        }
